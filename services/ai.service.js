const openai = require('../config/openai')
const rateLimit = require('express-rate-limit')

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
})

class AIService {
    static async generateCards(title, description) {
        try {
            const prompt = this.buildPrompt(title, description)

            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [{
                        role: "system",
                        content: "You are a helpful assistant that creates educational flashcards. Generate 5-10 flashcards based on the given topic. Each flashcard should have a clear, concise question on the front and a detailed answer on the back. Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Keep questions under 100 characters and answers under 200 characters. Always respond with valid JSON only."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })

            let response
            try {
                response = JSON.parse(completion.choices[0].message.content)
            } catch (parseError) {
                console.error('Failed to parse OpenAI response:', completion.choices[0].message.content)
                throw new Error('Invalid response format from OpenAI')
            }

            // Validate response format
            if (!Array.isArray(response.front) || !Array.isArray(response.back) ||
                response.front.length !== response.back.length) {
                throw new Error('Invalid response format from OpenAI')
            }

            // Validate content
            const validatedCards = this.validateCards(response.front, response.back)

            return {
                front: validatedCards.front,
                back: validatedCards.back
            }
        } catch (error) {
            console.error('AI Service Error:', error)

            // Handle OpenAI API errors
            if (error.response.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.')
            }
            if (error.response.status === 401) {
                throw new Error('OpenAI API key is invalid')
            }

            // Handle network errors
            if (error.code === 'ECONNREFUSED') {
                throw new Error('Could not connect to OpenAI service')
            }
            if (error.code === 'ETIMEDOUT') {
                throw new Error('OpenAI service request timed out')
            }

            // Handle JSON parsing errors
            if (error instanceof SyntaxError) {
                throw new Error('Invalid response from OpenAI')
            }

            // Handle other errors
            throw new Error(error.message || 'Failed to generate flashcards')
        }
    }

    static validateCards(front, back) {
        const validatedFront = []
        const validatedBack = []

        for (let i = 0; i < front.length; i++) {
            const frontText = front[i].trim()
            const backText = back[i].trim()

            // Skip invalid cards
            if (!frontText || !backText) continue
            if (frontText.length > 100 || backText.length > 200) continue

            validatedFront.push(frontText)
            validatedBack.push(backText)
        }

        // Ensure we have at least one valid card
        if (validatedFront.length === 0) {
            throw new Error('No valid cards were generated')
        }

        return {
            front: validatedFront,
            back: validatedBack
        }
    }

    static buildPrompt(title, description) {
        return `Create educational flashcards for the following topic:
Title: ${title}
Description: ${description}

Please generate 5-10 flashcards that cover the key concepts of this topic. Each flashcard should:
1. Have a clear, concise question on the front (max 100 characters)
2. Have a short direct simple answer on the back (max 200 characters)
3. Be educational and accurate
4. Be suitable for learning and memorization
5. Use simple, clear language
6. Focus on one concept per card

Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Example format:
{
  "front": ["What is X?", "How does Y work?"],
  "back": ["Correct Answer", "Next Response"]
}`
    }
}

module.exports = AIService