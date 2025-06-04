const OpenAIClient = require('./utils/OpenAIClient')
const ImageService = require('./image-tools/ImageService')
const CloudinaryService = require('../CloudinaryService')
const queueService = require('../QueueService')
const FlashcardPrompts = require('./prompts/flashcardPrompts')

class AiSetSequence {
    constructor() {
        this.client = new OpenAIClient()
    }

    /**
     * Validates card content structure
     * @param {Object} card - Card to validate
     * @returns {boolean} Whether card is valid
     */
    validateCard(card) {
        console.log('AiSetSequence.validateCard - Validating card:', JSON.stringify(card, null, 2))

        if (!card || typeof card !== 'object') {
            console.log('AiSetSequence.validateCard - Invalid card object')
            return false
        }

        if (!card.front || !card.back) {
            console.log('AiSetSequence.validateCard - Missing front or back')
            return false
        }

        // Validate front
        if (typeof card.front !== 'object') {
            console.log('AiSetSequence.validateCard - Front must be an object')
            return false
        }

        // Validate back
        if (typeof card.back !== 'object') {
            console.log('AiSetSequence.validateCard - Back must be an object')
            return false
        }

        // Convert imagePrompt to imageUrl if present
        if (card.front.imagePrompt) {
            card.front.imageUrl = card.front.imagePrompt
            delete card.front.imagePrompt
        }
        if (card.back.imagePrompt) {
            card.back.imageUrl = card.back.imagePrompt
            delete card.back.imagePrompt
        }

        // Check that at least one of text or imageUrl exists on each side
        const hasFrontContent = (card.front.text && card.front.text.trim() !== '') ||
            (card.front.imageUrl && card.front.imageUrl.trim() !== '')
        const hasBackContent = (card.back.text && card.back.text.trim() !== '') ||
            (card.back.imageUrl && card.back.imageUrl.trim() !== '')

        if (!hasFrontContent) {
            console.log('AiSetSequence.validateCard - Front has no content (text or image)')
            return false
        }

        if (!hasBackContent) {
            console.log('AiSetSequence.validateCard - Back has no content (text or image)')
            return false
        }

        // Validate text if present
        if (card.front.text && typeof card.front.text !== 'string') {
            console.log('AiSetSequence.validateCard - Invalid front text type')
            return false
        }

        if (card.back.text && typeof card.back.text !== 'string') {
            console.log('AiSetSequence.validateCard - Invalid back text type')
            return false
        }

        // Validate imageUrl if present
        if (card.front.imageUrl && typeof card.front.imageUrl !== 'string') {
            console.log('AiSetSequence.validateCard - Invalid front imageUrl type')
            return false
        }

        if (card.back.imageUrl && typeof card.back.imageUrl !== 'string') {
            console.log('AiSetSequence.validateCard - Invalid back imageUrl type')
            return false
        }

        console.log('AiSetSequence.validateCard - Card is valid')
        return true
    }

    /**
     * Generates card content using AI with function calling
     * @param {string} title - Set title
     * @param {string} description - Set description
     * @returns {Promise<Object>} Raw card content with prompts and completion
     */
    async generateCardContent(title, description) {
        console.log('AiSetSequence.generateCardContent - Starting with:', { title, description })

        const functions = FlashcardPrompts.getFunctionCallFormat()

        console.log('AiSetSequence.generateCardContent - Calling OpenAI')
        const completion = await this.client.callOpenAI(
            FlashcardPrompts.getUserPrompt(title, description), {
                functions,
                function_call: { name: "generateCards" },
                systemPrompt: FlashcardPrompts.getSystemPrompt()
            }
        )
        console.log('AiSetSequence.generateCardContent - OpenAI response:', completion)

        const functionCall = completion.choices[0].message.function_call
        if (!functionCall || functionCall.name !== "generateCards") {
            console.log('AiSetSequence.generateCardContent - Invalid function call:', functionCall)
            throw new Error("Invalid response format from AI")
        }

        const result = JSON.parse(functionCall.arguments)
        console.log('AiSetSequence.generateCardContent - Parsed result:', result)

        if (!result.cards || !Array.isArray(result.cards)) {
            console.log('AiSetSequence.generateCardContent - Invalid cards array:', result)
            throw new Error("Invalid cards array in AI response")
        }

        // Validate each card
        const validCards = result.cards.filter(card => this.validateCard(card))
        console.log('AiSetSequence.generateCardContent - Valid cards:', validCards)

        if (validCards.length === 0) {
            console.log('AiSetSequence.generateCardContent - No valid cards found')
            throw new Error("No valid cards generated")
        }

        return {
            cards: validCards,
            completion: {
                model: completion.model,
                usage: completion.usage
            }
        }
    }

    /**
     * Generates and uploads a single image with queuing
     * @param {string} prompt - Image generation prompt
     * @param {number} userId - User ID for tracking
     * @returns {Promise<string|null>} Cloudinary URL or null if failed
     */
    async generateAndUploadImage(prompt, userId) {
        console.log('AiSetSequence.generateAndUploadImage - Starting with:', { prompt, userId })
        const MAX_RETRIES = 1
        let retryCount = 0

        while (retryCount < MAX_RETRIES) {
            try {
                // Generate the image
                console.log(`AiSetSequence.generateAndUploadImage - Generating image (attempt ${retryCount + 1})`)
                const imageBuffer = await ImageService.generateImage(
                    prompt,
                    'Card Image',
                    userId,
                    'card'
                )

                if (!imageBuffer) {
                    throw new Error('No image buffer returned')
                }

                // Upload to Cloudinary
                console.log('AiSetSequence.generateAndUploadImage - Uploading to Cloudinary')
                const uploadResult = await CloudinaryService.uploadImage(imageBuffer, {
                    folder: 'flashcards',
                    resource_type: 'image'
                })

                if (!uploadResult || !uploadResult.secure_url) {
                    throw new Error('No upload URL returned')
                }

                console.log('AiSetSequence.generateAndUploadImage - Successfully uploaded image:', uploadResult.secure_url)
                return uploadResult.secure_url
            } catch (error) {
                console.error(`AiSetSequence.generateAndUploadImage - Error (attempt ${retryCount + 1}):`, error)
                retryCount++

                if (retryCount === MAX_RETRIES) {
                    console.error('AiSetSequence.generateAndUploadImage - Max retries reached')
                    return null
                }

                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000))
            }
        }
        return null
    }

    /**
     * Processes a single card's images
     * @param {Object} card - Card content
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Processed card with image URLs
     */
    async processCardImages(card, userId) {
        console.log('AiSetSequence.processCardImages - Processing card with userId:', userId)
        const processedCard = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            front: {
                text: card.front.text || '',
                imageUrl: null
            },
            back: {
                text: card.back.text || '',
                imageUrl: null
            },
            hint: null,
            setId: 0
        }

        try {
            // Process front image if needed
            if (card.front.imageUrl) {
                console.log('AiSetSequence.processCardImages - Generating front image with url:', card.front.imageUrl)
                const frontImageUrl = await this.generateAndUploadImage(
                    card.front.imageUrl,
                    userId
                )
                if (frontImageUrl) {
                    processedCard.front.imageUrl = frontImageUrl
                    console.log('AiSetSequence.processCardImages - Front image generated:', frontImageUrl)
                } else {
                    console.error('AiSetSequence.processCardImages - Front image generation failed')
                        // Ensure we have text content if image fails
                    if (!processedCard.front.text) {
                        processedCard.front.text = 'Image generation failed'
                    }
                }
            }

            // Process back image if needed
            if (card.back.imageUrl) {
                console.log('AiSetSequence.processCardImages - Generating back image with url:', card.back.imageUrl)
                const backImageUrl = await this.generateAndUploadImage(
                    card.back.imageUrl,
                    userId
                )
                if (backImageUrl) {
                    processedCard.back.imageUrl = backImageUrl
                    console.log('AiSetSequence.processCardImages - Back image generated:', backImageUrl)
                } else {
                    console.error('AiSetSequence.processCardImages - Back image generation failed')
                        // Ensure we have text content if image fails
                    if (!processedCard.back.text) {
                        processedCard.back.text = 'Image generation failed'
                    }
                }
            }

            // Validate card has content
            if (!processedCard.front.text && !processedCard.front.imageUrl) {
                processedCard.front.text = 'No content available'
            }
            if (!processedCard.back.text && !processedCard.back.imageUrl) {
                processedCard.back.text = 'No content available'
            }

        } catch (error) {
            console.error('AiSetSequence.processCardImages - Error generating images:', error)
                // Ensure card has some content even if everything fails
            if (!processedCard.front.text && !processedCard.front.imageUrl) {
                processedCard.front.text = 'Content generation failed'
            }
            if (!processedCard.back.text && !processedCard.back.imageUrl) {
                processedCard.back.text = 'Content generation failed'
            }
        }

        console.log('AiSetSequence.processCardImages - Completed processing card:', processedCard)
        return processedCard
    }

    /**
     * Processes all cards with rate limiting
     * @param {Array} cards - Raw card content
     * @param {number} userId - User ID
     * @returns {Promise<Array>} Processed cards with image URLs
     */
    async processAllCards(cards, userId) {
        console.log('AiSetSequence.processAllCards - Starting with:', { cardCount: cards.length, userId })
        const processedCards = []

        // Process one card at a time to avoid rate limits
        for (let i = 0; i < cards.length; i++) {
            console.log(`AiSetSequence.processAllCards - Processing card ${i + 1}/${cards.length}`)
            const processedCard = await this.processCardImages(cards[i], userId)
            processedCards.push(processedCard)

            // Add a small delay between cards
            if (i < cards.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        }

        console.log('AiSetSequence.processAllCards - Completed processing all cards:', processedCards)
        return processedCards
    }

    /**
     * Main sequence for generating a complete set
     * @param {string} title - Set title
     * @param {string} description - Set description
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Generation results
     */
    async generateSet(title, description, userId) {
        console.log('AiSetSequence.generateSet - Starting with:', { title, description, userId })
        try {
            // 1. Generate card content
            console.log('AiSetSequence.generateSet - Generating card content')
            const startTime = Date.now()
            const { cards, completion } = await this.generateCardContent(title, description)
            const duration = Date.now() - startTime
            console.log('AiSetSequence.generateSet - Generated cards:', cards)

            if (!cards || cards.length === 0) {
                return {
                    success: false,
                    error: 'No cards were generated'
                }
            }

            // 2. Process cards with images
            const processedCards = await this.processAllCards(cards, userId)

            return {
                success: true,
                cards: processedCards,
                status: 'success',
                completion: completion || {
                    model: 'gpt-4',
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0
                    }
                },
                duration
            }

        } catch (error) {
            console.error('AiSetSequence.generateSet - Error:', error)
            return {
                success: false,
                error: error.message || 'Failed to generate cards'
            }
        }
    }
}

module.exports = new AiSetSequence()