const { DEFAULT_STYLES } = require('./constants')

class ImagePromptBuilder {
    static buildPrompt(title, description, type = 'thumbnail', customStyle = null) {
        const cleanTitle = title.trim()
        const cleanDescription = description.trim()
        const style = customStyle || DEFAULT_STYLES[type] || DEFAULT_STYLES.thumbnail

        return `Create a ${type} image for: "${cleanTitle}". 
        
Description: ${cleanDescription}. 

Style: ${style}.`
    }

    static buildThumbnailPrompt(title, description) {
        return this.buildPrompt(title, description, 'thumbnail')
    }

    static buildCardPrompt(title, description) {
        return this.buildPrompt(title, description, 'card')
    }

    static buildAvatarPrompt(title, description) {
        return this.buildPrompt(title, description, 'avatar')
    }
}

module.exports = ImagePromptBuilder