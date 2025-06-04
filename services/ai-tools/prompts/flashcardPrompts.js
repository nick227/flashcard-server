const { MIN_CARDS, MAX_CARDS, MAX_FRONT_LENGTH, MAX_BACK_LENGTH } = require('../utils/constants')

class FlashcardPrompts {
    static getSystemPrompt() {
        return `You are a helpful assistant that creates educational flashcards. Generate ${MIN_CARDS}-${MAX_CARDS} flashcards based on the given topic. Each flashcard should have a clear, concise question on the front and a short direct simple answer on the back. Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Keep questions under ${MAX_FRONT_LENGTH} characters and answers under ${MAX_BACK_LENGTH} characters. Always respond with valid JSON only.`
    }

    static getUserPrompt(title, description) {
        return `You are planning a flashcard set. You can use text, images, or both on the cards. 

        Plan the cards you will create.
        
        Analyze the title and description to determine the best way to present the content:

        Title: ${title}
        Description: ${description}

        For each card:
        - You can use text only
        - You can use images only
        - You can use both text and images
        - At least one side must have either text or an image
        - If using images, provide a detailed prompt that will generate a clear, educational image`
    }

    static getFunctionCallFormat() {
        return [{
            name: "generateCards",
            description: "Generate a set of flashcards with text and/or images",
            parameters: {
                type: "object",
                properties: {
                    cards: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                front: {
                                    type: "object",
                                    properties: {
                                        text: {
                                            type: "string",
                                            description: "Optional text for the front of the card"
                                        },
                                        imagePrompt: {
                                            type: "string",
                                            description: "Optional prompt for generating an image for the front"
                                        }
                                    }
                                },
                                back: {
                                    type: "object",
                                    properties: {
                                        text: {
                                            type: "string",
                                            description: "Optional text for the back of the card"
                                        },
                                        imagePrompt: {
                                            type: "string",
                                            description: "Optional prompt for generating an image for the back"
                                        }
                                    }
                                }
                            },
                            required: ["front", "back"]
                        }
                    }
                },
                required: ["cards"]
            }
        }]
    }

    static originalUserPrompt(title, description) {
        return `Create educational flashcards for the following topic:
                Title: ${title}
                Description: ${description}

                Please generate ${MIN_CARDS}-${MAX_CARDS} flashcards that cover the key concepts of this topic. Each flashcard should:
                1. Have a clear, concise question on the front (max ${MAX_FRONT_LENGTH} characters)
                2. Have a short direct simple answer on the back prefferring single words when possible (max ${MAX_BACK_LENGTH} characters)
                3. Be educational and accurate
                4. Be suitable for learning and memorization
                5. Use simple, clear language
                6. Focus on one concept per card

                Format your response as a JSON object with 'front' and 'back' arrays containing the questions and answers respectively. Example format:
                {
                "front": ["What is X?", "How does Y work?"],
                "back": ["Answer", "Response"]
                }`
    }
}

module.exports = FlashcardPrompts