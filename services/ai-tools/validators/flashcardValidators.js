const {
    MAX_FRONT_LENGTH,
    MAX_BACK_LENGTH,
    MIN_CARDS,
    MAX_CARDS,
    MAX_TITLE_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    ERROR_MESSAGES
} = require('../utils/constants')

class FlashcardValidators {
    static validateInput(title, description) {
        if (!title.trim() || !description.trim()) {
            throw new Error(ERROR_MESSAGES.TITLE_REQUIRED)
        }

        const trimmedTitle = title.trim()
        const trimmedDescription = description.trim()

        if (trimmedTitle.length > MAX_TITLE_LENGTH) {
            throw new Error(ERROR_MESSAGES.TITLE_TOO_LONG)
        }

        if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
            throw new Error(ERROR_MESSAGES.DESCRIPTION_TOO_LONG)
        }

        return { title: trimmedTitle, description: trimmedDescription }
    }

    static isValidResponseFormat(response) {
        return Array.isArray(response.front) &&
            Array.isArray(response.back) &&
            response.front.length === response.back.length &&
            response.front.length >= MIN_CARDS &&
            response.front.length <= MAX_CARDS
    }

    static validateCards(front, back) {
        const validatedFront = []
        const validatedBack = []

        for (let i = 0; i < front.length; i++) {
            const frontText = front[i].text ? front[i].text.trim() : ''
            const backText = back[i].text ? back[i].text.trim() : ''
            const frontImageUrl = front[i].imageUrl || null
            const backImageUrl = back[i].imageUrl || null

            if (this.isValidCard(frontText, backText, frontImageUrl, backImageUrl)) {
                validatedFront.push({
                    text: frontText,
                    imageUrl: frontImageUrl
                })
                validatedBack.push({
                    text: backText,
                    imageUrl: backImageUrl
                })
            }
        }

        if (validatedFront.length === 0) {
            throw new Error(ERROR_MESSAGES.NO_VALID_CARDS)
        }

        return {
            front: validatedFront,
            back: validatedBack
        }
    }

    static isValidCard(frontText, backText, frontImageUrl, backImageUrl) {
        const hasFrontContent = (frontText && frontText.length > 0) || frontImageUrl
        const hasBackContent = (backText && backText.length > 0) || backImageUrl

        return hasFrontContent &&
            hasBackContent &&
            (!frontText || frontText.length <= MAX_FRONT_LENGTH) &&
            (!backText || backText.length <= MAX_BACK_LENGTH)
    }
}

module.exports = FlashcardValidators