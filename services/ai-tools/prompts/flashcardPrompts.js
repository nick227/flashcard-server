const { MIN_CARDS, MAX_CARDS, MAX_FRONT_LENGTH, MAX_BACK_LENGTH } = require('../utils/constants')

class FlashcardPrompts {
    static getSystemPrompt() {
        return `You are a helpful assistant that creates educational flashcards. Generate ${MIN_CARDS}-${MAX_CARDS} flashcards based on the given topic. Each flashcard should have a clear, concise question on the front and a short direct simple answer on the back. Keep questions under ${MAX_FRONT_LENGTH} characters and answers under ${MAX_BACK_LENGTH} characters. Avoid excessive language. You can use images on the cards if you want. Some cards will have both text and images. Some cards will have only text. Some cards will have only images. Format your response as a cards array of JSON objects with 'front', 'back' properties containing the imagePrompt and text of the cards. Always respond with valid JSON only.`
    }

    static getUserPrompt(title, description, category) {
        return `You are planning a flashcard set. You can use text, images, or both on the cards. 

        Plan the cards you will create.
        
        Analyze the user's title, category and description to determine the best way to present the content:

        Title: ${title}
        Category: ${category}
        Description: ${description}

        For each card:
        - You can use text only
        - You can use images only
        - You can use both text and images
        - Both sides must have some content
        - If using images, provide an ai prompt 
        - Always use the user's title, category and description
        - Keep the cards short and concise
        - Always return valid JSON only`
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

}

module.exports = FlashcardPrompts