const {
    MAX_TITLE_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    ERROR_MESSAGES
} = require('./constants')

class ImageValidators {
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

    static validateImageType(type) {
        const validTypes = ['thumbnail', 'card', 'avatar']
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid image type. Must be one of: ${validTypes.join(', ')}`)
        }
        return type
    }
}

module.exports = ImageValidators