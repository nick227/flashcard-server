class SingleCardFacePrompts {
    static getSystemPrompt() {
        return `You are a helpful assistant that creates educational flashcard content. Your task is to generate content for a single side of a flashcard (front or back) based on the given context. The content should be clear, concise, and educational. Keep the content under 500 characters. Avoid excessive language. Focus on creating content that complements the other side of the card.`
    }

    static getUserPrompt(side, title, description, category, otherSideContent) {
        return `Generate content for the ${side} of a flashcard.

Context:
Title: ${title}
Category: ${category}
Description: ${description}

Other side content: ${otherSideContent}

Requirements:
- Create clear, concise educational content
- Keep it under 500 characters
- Ensure it complements the other side
- Focus on accuracy and clarity
- Only return the EXACT content that will be displayed on the card face`
    }

    static getFunctionCallFormat() {
        return [{
            name: "generateCardFace",
            description: "Generate content for a single side of a flashcard",
            parameters: {
                type: "object",
                properties: {
                    text: {
                        type: "string",
                        description: "The generated content for the card face"
                    }
                },
                required: ["text"]
            }
        }]
    }
}

module.exports = SingleCardFacePrompts