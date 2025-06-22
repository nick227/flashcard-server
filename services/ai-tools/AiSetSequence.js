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
     * Validates a single card structure
     * @param {Object} card - Card to validate
     * @returns {boolean} Whether card is valid
     */
    validateCard(card) {
        if (!card || typeof card !== 'object') {
            return false
        }

        if (!card.front || !card.back) {
            return false
        }

        // Validate front
        if (typeof card.front !== 'object') {
            return false
        }

        // Validate back
        if (typeof card.back !== 'object') {
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
            return false
        }

        if (!hasBackContent) {
            return false
        }

        // Validate text if present
        if (card.front.text && typeof card.front.text !== 'string') {
            return false
        }

        if (card.back.text && typeof card.back.text !== 'string') {
            return false
        }

        // Validate imageUrl if present
        if (card.front.imageUrl && typeof card.front.imageUrl !== 'string') {
            return false
        }

        if (card.back.imageUrl && typeof card.back.imageUrl !== 'string') {
            return false
        }

        return true
    }

    /**
     * Generates card content using AI with function calling
     * @param {string} title - Set title
     * @param {string} description - Set description
     * @param {string} category - Set category
     * @returns {Promise<Object>} Raw card content with prompts and completion
     */
    async generateCardContent(title, description, category) {
        const functions = FlashcardPrompts.getFunctionCallFormat()

        const completion = await this.client.callOpenAI(
            FlashcardPrompts.getUserPrompt(title, description, category), {
                functions,
                function_call: { name: "generateCards" },
                systemPrompt: FlashcardPrompts.getSystemPrompt()
            }
        )

        const functionCall = completion.choices[0].message.function_call
        if (!functionCall || functionCall.name !== "generateCards") {
            throw new Error("Invalid response format from AI")
        }

        const result = JSON.parse(functionCall.arguments)

        if (!result.cards || !Array.isArray(result.cards)) {
            throw new Error("Invalid cards array in AI response")
        }

        // Validate each card
        const validCards = result.cards.filter(card => this.validateCard(card))

        if (validCards.length === 0) {
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
        const MAX_RETRIES = 1
        let retryCount = 0

        while (retryCount < MAX_RETRIES) {
            try {
                // Generate the image
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
                const uploadResult = await CloudinaryService.uploadImage(imageBuffer, {
                    folder: 'flashcards',
                    resource_type: 'image'
                })

                if (!uploadResult || !uploadResult.secure_url) {
                    throw new Error('No upload URL returned')
                }

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
                const frontImageUrl = await this.generateAndUploadImage(
                    card.front.imageUrl,
                    userId
                )
                if (frontImageUrl) {
                    processedCard.front.imageUrl = frontImageUrl
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
                const backImageUrl = await this.generateAndUploadImage(
                    card.back.imageUrl,
                    userId
                )
                if (backImageUrl) {
                    processedCard.back.imageUrl = backImageUrl
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

        return processedCard
    }

    /**
     * Processes all cards with rate limiting
     * @param {Array} cards - Raw card content
     * @param {number} userId - User ID
     * @param {Socket} socket - Socket instance for progress updates
     * @param {string} generationId - Generation ID for tracking
     * @returns {Promise<Array>} Processed cards with image URLs
     */
    async processAllCards(cards, userId, socket, generationId) {
        const processedCards = []

        // Process one card at a time to avoid rate limits
        for (let i = 0; i < cards.length; i++) {
            // Emit progress update before processing card
            if (socket && generationId) {
                const progress = Math.round((i / cards.length) * 100)
                socket.emit('generationProgress', {
                    generationId,
                    message: `Processing card ${i + 1} of ${cards.length}...`,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1,
                    stage: 'processing'
                })
            }

            const processedCard = await this.processCardImages(cards[i], userId)
            processedCards.push(processedCard)

            // Emit card immediately after processing
            if (socket && generationId) {
                const progress = Math.round(((i + 1) / cards.length) * 100)
                socket.emit('cardGenerated', {
                    generationId,
                    card: processedCard,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1,
                    stage: 'completed'
                })

                // Small delay to ensure client processes the card
                await new Promise(resolve => setTimeout(resolve, 50))
            }

            // Add a small delay between cards to prevent overwhelming the client
            if (i < cards.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        }

        return processedCards
    }

    /**
     * Main sequence for generating a complete set
     * @param {string} title - Set title
     * @param {string} description - Set description
     * @param {string} category - Set category
     * @param {number} userId - User ID
     * @param {Socket} socket - Socket instance for progress updates
     * @param {string} generationId - Generation ID for tracking
     * @returns {Promise<Object>} Generation results
     */
    async generateSet(title, description, category, userId, socket = null, generationId = null) {
        try {
            // 1. Generate card content
            const startTime = Date.now()

            // Emit initial progress
            if (socket && generationId) {
                socket.emit('generationProgress', {
                    generationId,
                    message: 'Generating card content with AI...',
                    progress: 0,
                    totalCards: 0,
                    stage: 'initializing'
                })
            }

            const { cards, completion } = await this.generateCardContent(title, description, category)
            const duration = Date.now() - startTime

            if (!cards || cards.length === 0) {
                return {
                    success: false,
                    error: 'No cards were generated'
                }
            }

            // Emit progress update before processing images
            if (socket && generationId) {
                socket.emit('generationProgress', {
                    generationId,
                    message: `Generated ${cards.length} cards, now processing images...`,
                    progress: 10,
                    totalCards: cards.length,
                    stage: 'content_generated'
                })
            }

            // 2. Process cards with images
            const processedCards = await this.processAllCards(cards, userId, socket, generationId)

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