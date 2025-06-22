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
     * @param {string} generationId - Generation ID for cancellation checking
     * @param {Map} activeGenerations - Active generations map for cancellation checking
     * @returns {Promise<Object>} Raw card content with prompts and completion
     */
    async generateCardContent(title, description, category, generationId = null, activeGenerations = null) {
        // Check if generation has been cancelled before making API call
        if (generationId && this.isGenerationCancelled(generationId, activeGenerations)) {
            console.log(`Generation ${generationId} cancelled before OpenAI API call`)
            throw new Error('Generation cancelled')
        }

        const functions = FlashcardPrompts.getFunctionCallFormat()

        const completion = await this.client.callOpenAI(
            FlashcardPrompts.getUserPrompt(title, description, category), {
                functions,
                function_call: { name: "generateCards" },
                systemPrompt: FlashcardPrompts.getSystemPrompt()
            }
        )

        // Check again after API call
        if (generationId && this.isGenerationCancelled(generationId, activeGenerations)) {
            console.log(`Generation ${generationId} cancelled after OpenAI API call`)
            throw new Error('Generation cancelled')
        }

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
     * @param {string} generationId - Generation ID for cancellation checking
     * @param {Map} activeGenerations - Active generations map for cancellation checking
     * @returns {Promise<string|null>} Cloudinary URL or null if failed
     */
    async generateAndUploadImage(prompt, userId, generationId = null, activeGenerations = null) {
        // Check if generation has been cancelled before starting image generation
        if (generationId && this.isGenerationCancelled(generationId, activeGenerations)) {
            console.log(`Generation ${generationId} cancelled before image generation`)
            return null
        }

        const MAX_RETRIES = 1
        let retryCount = 0

        while (retryCount < MAX_RETRIES) {
            try {
                // Check again before each retry
                if (generationId && this.isGenerationCancelled(generationId, activeGenerations)) {
                    console.log(`Generation ${generationId} cancelled during image generation retry`)
                    return null
                }

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

                // Check again after image generation
                if (generationId && this.isGenerationCancelled(generationId, activeGenerations)) {
                    console.log(`Generation ${generationId} cancelled after image generation`)
                    return null
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
     * @param {string} generationId - Generation ID for cancellation checking
     * @param {Map} activeGenerations - Active generations map for cancellation checking
     * @returns {Promise<Object>} Processed card with image URLs
     */
    async processCardImages(card, userId, generationId = null, activeGenerations = null) {
        const processedCard = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            front: {
                text: card.front.text || '',
                imageUrl: null,
                layout: 'default'
            },
            back: {
                text: card.back.text || '',
                imageUrl: null,
                layout: 'default'
            },
            hint: null,
            setId: 0
        }

        try {
            // Process front image if needed - check for both imageUrl and imagePrompt
            const frontImagePrompt = card.front.imageUrl || card.front.imagePrompt
            if (frontImagePrompt) {
                const frontImageUrl = await this.generateAndUploadImage(
                    frontImagePrompt,
                    userId,
                    generationId,
                    activeGenerations
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

            // Process back image if needed - check for both imageUrl and imagePrompt
            const backImagePrompt = card.back.imageUrl || card.back.imagePrompt
            if (backImagePrompt) {
                const backImageUrl = await this.generateAndUploadImage(
                    backImagePrompt,
                    userId,
                    generationId,
                    activeGenerations
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

            // Determine layout based on final content (after image processing)
            // Only set two-row if both text and image are substantial
            const frontHasSubstantialText = processedCard.front.text &&
                processedCard.front.text.trim().length > 10 &&
                processedCard.front.text !== 'Image generation failed' &&
                processedCard.front.text !== 'No content available'
            const backHasSubstantialText = processedCard.back.text &&
                processedCard.back.text.trim().length > 10 &&
                processedCard.back.text !== 'Image generation failed' &&
                processedCard.back.text !== 'No content available'

            if (frontHasSubstantialText && processedCard.front.imageUrl) {
                processedCard.front.layout = 'two-row'
            }
            if (backHasSubstantialText && processedCard.back.imageUrl) {
                processedCard.back.layout = 'two-row'
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
     * Check if generation has been cancelled
     * @param {string} generationId - The generation ID to check
     * @param {Map} activeGenerations - The active generations map
     * @returns {boolean} Whether the generation has been cancelled
     */
    isGenerationCancelled(generationId, activeGenerations) {
        return !activeGenerations || !activeGenerations.has(generationId)
    }

    /**
     * Processes all cards with rate limiting
     * @param {Array} cards - Raw card content
     * @param {number} userId - User ID
     * @param {Socket} socket - Socket instance for progress updates
     * @param {string} generationId - Generation ID for tracking
     * @param {Function} safeEmit - Safe emit function that checks connection status
     * @param {Map} activeGenerations - Active generations map for cancellation checking
     * @returns {Promise<Array>} Processed cards with image URLs
     */
    async processAllCards(cards, userId, socket, generationId, safeEmit = null, activeGenerations = null) {
        const processedCards = []

        // Process one card at a time to avoid rate limits
        for (let i = 0; i < cards.length; i++) {
            // Check if generation has been cancelled
            if (this.isGenerationCancelled(generationId, activeGenerations)) {
                console.log(`Generation ${generationId} cancelled during card processing`)
                return processedCards // Return what we have so far
            }

            // Emit progress update before processing card
            if (socket && generationId) {
                const progress = Math.round((i / cards.length) * 100)
                const progressData = {
                    generationId,
                    message: `Processing card ${i + 1} of ${cards.length}...`,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1,
                    stage: 'processing'
                }

                if (safeEmit) {
                    safeEmit(socket, 'generationProgress', progressData)
                } else {
                    socket.emit('generationProgress', progressData)
                }
            }

            const processedCard = await this.processCardImages(cards[i], userId, generationId, activeGenerations)
            processedCards.push(processedCard)

            // Check again after processing card
            if (this.isGenerationCancelled(generationId, activeGenerations)) {
                console.log(`Generation ${generationId} cancelled after processing card ${i + 1}`)
                return processedCards // Return what we have so far
            }

            // Emit card immediately after processing
            if (socket && generationId) {
                const progress = Math.round(((i + 1) / cards.length) * 100)
                const cardData = {
                    generationId,
                    card: processedCard,
                    progress,
                    totalCards: cards.length,
                    currentCard: i + 1,
                    stage: 'completed'
                }

                if (safeEmit) {
                    safeEmit(socket, 'cardGenerated', cardData)
                } else {
                    socket.emit('cardGenerated', cardData)
                }

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
     * @param {Function} safeEmit - Safe emit function that checks connection status
     * @param {Map} activeGenerations - Active generations map for cancellation checking
     * @returns {Promise<Object>} Generation results
     */
    async generateSet(title, description, category, userId, socket = null, generationId = null, safeEmit = null, activeGenerations = null) {
        try {
            // 1. Generate card content
            const startTime = Date.now()

            // Check if generation has been cancelled before starting
            if (this.isGenerationCancelled(generationId, activeGenerations)) {
                console.log(`Generation ${generationId} cancelled before content generation`)
                return {
                    success: false,
                    error: 'Generation cancelled'
                }
            }

            // Emit initial progress
            if (socket && generationId) {
                const initialData = {
                    generationId,
                    message: 'Generating card content with AI...',
                    progress: 0,
                    totalCards: 0,
                    stage: 'initializing'
                }

                if (safeEmit) {
                    safeEmit(socket, 'generationProgress', initialData)
                } else {
                    socket.emit('generationProgress', initialData)
                }
            }

            const { cards, completion } = await this.generateCardContent(title, description, category, generationId, activeGenerations)
            const duration = Date.now() - startTime

            // Check if generation was cancelled during content generation
            if (this.isGenerationCancelled(generationId, activeGenerations)) {
                console.log(`Generation ${generationId} cancelled during content generation`)
                return {
                    success: false,
                    error: 'Generation cancelled'
                }
            }

            if (!cards || cards.length === 0) {
                return {
                    success: false,
                    error: 'No cards were generated'
                }
            }

            // Emit progress update before processing images
            if (socket && generationId) {
                const progressData = {
                    generationId,
                    message: `Generated ${cards.length} cards, now processing images...`,
                    progress: 10,
                    totalCards: cards.length,
                    stage: 'content_generated'
                }

                if (safeEmit) {
                    safeEmit(socket, 'generationProgress', progressData)
                } else {
                    socket.emit('generationProgress', progressData)
                }
            }

            // 2. Process cards with images
            const processedCards = await this.processAllCards(cards, userId, socket, generationId, safeEmit, activeGenerations)

            // Check if generation was cancelled during processing
            if (this.isGenerationCancelled(generationId, activeGenerations)) {
                console.log(`Generation ${generationId} cancelled during image processing`)
                return {
                    success: false,
                    error: 'Generation cancelled',
                    cards: processedCards // Return what we processed so far
                }
            }

            // Emit final completion event
            if (socket && generationId) {
                const completeData = {
                    generationId,
                    totalCards: processedCards.length,
                    stage: 'completed'
                }

                if (safeEmit) {
                    safeEmit(socket, 'generationComplete', completeData)
                } else {
                    socket.emit('generationComplete', completeData)
                }
            }

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

            // Emit error event to client
            if (socket && generationId) {
                const errorData = {
                    generationId,
                    error: error.message || 'Failed to generate cards'
                }

                if (safeEmit) {
                    safeEmit(socket, 'generationError', errorData)
                } else {
                    socket.emit('generationError', errorData)
                }
            }

            return {
                success: false,
                error: error.message || 'Failed to generate cards'
            }
        }
    }
}

module.exports = new AiSetSequence()