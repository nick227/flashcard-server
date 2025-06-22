const db = require('../../db')
const { v4: uuidv4 } = require('uuid')

class GenerationSessionService {
    constructor() {
        this.GenerationSession = db.GenerationSession
        this.ERROR_MESSAGES = {
            SESSION_NOT_FOUND: 'Session not found',
            CREATE_FAILED: 'Failed to start generation session',
            UPDATE_FAILED: 'Failed to update session progress',
            CLEANUP_FAILED: 'Failed to cleanup session',
            INVALID_STATUS: 'Invalid session status',
            INVALID_TRANSITION: 'Invalid status transition'
        }

        // Valid status transitions
        this.VALID_STATUS_TRANSITIONS = {
            'preparing': ['generating', 'failed', 'cancelled'],
            'generating': ['completed', 'failed', 'cancelled'],
            'completed': [],
            'failed': [],
            'cancelled': []
        }
    }

    /**
     * Validate status transition
     * @param {string} currentStatus - Current status
     * @param {string} newStatus - New status
     * @returns {boolean} Whether the transition is valid
     */
    isValidStatusTransition(currentStatus, newStatus) {
        const transitions = this.VALID_STATUS_TRANSITIONS[currentStatus] || []
        return transitions.includes(newStatus)
    }

    /**
     * Create a new generation session
     * @param {number} userId - The user ID
     * @param {string} title - The set title
     * @param {string} description - The set description
     * @param {string} [status] - The initial status (optional)
     * @param {string} [category] - The set category (optional)
     * @returns {Promise<GenerationSession>} The created session
     */
    async createSession(userId, title, description, status = 'preparing', category = null) {
        try {
            const sessionId = `gen_${Date.now()}`
            const sessionData = {
                id: sessionId,
                user_id: userId,
                title,
                description,
                status,
                openai_request_id: 'pending',
                total_cards: 10,
                cards_generated: 0,
                started_at: new Date()
            }

            const session = await this.GenerationSession.create(sessionData)

            if (!session) {
                throw new Error(this.ERROR_MESSAGES.CREATE_FAILED)
            }

            return session
        } catch (error) {
            console.error('Failed to create generation session:', error)
            throw new Error(this.ERROR_MESSAGES.CREATE_FAILED + ': ' + error.message)
        }
    }

    async updateProgress(sessionId, {
        status,
        cardsGenerated,
        totalCards,
        currentOperation,
        errorMessage = null,
        openai_request_id = null
    }) {
        try {
            // Get current session
            let session = await this.getSession(sessionId)

            // If session doesn't exist and we're in preparing state, create it
            if (!session && status === 'preparing') {
                session = await this.GenerationSession.create({
                    id: sessionId,
                    status: 'preparing',
                    cards_generated: 0,
                    total_cards: totalCards || 10,
                    started_at: new Date(),
                    openai_request_id: openai_request_id || 'pending',
                    user_id: 1 // TODO: Get this from the context
                })
            }

            // If still no session, throw error
            if (!session) {
                throw new Error(this.ERROR_MESSAGES.SESSION_NOT_FOUND)
            }

            // Validate status transition if status is changing
            if (status && status !== session.status) {
                if (!this.isValidStatusTransition(session.status, status)) {
                    throw new Error(this.ERROR_MESSAGES.INVALID_TRANSITION)
                }
            }

            const updateData = {
                ...(status && { status }),
                ...(cardsGenerated !== undefined && { cards_generated: cardsGenerated }),
                ...(totalCards !== undefined && { total_cards: totalCards }),
                ...(currentOperation && { current_operation: currentOperation }),
                ...(errorMessage && { error_message: errorMessage }),
                ...(openai_request_id && { openai_request_id })
            }

            // Set completion time for terminal states
            if (status && ['completed', 'failed', 'cancelled'].includes(status)) {
                updateData.completed_at = new Date()
            }

            const [updated] = await this.GenerationSession.update(
                updateData, { where: { id: sessionId } }
            )

            if (!updated) {
                throw new Error(this.ERROR_MESSAGES.SESSION_NOT_FOUND)
            }

            return updated
        } catch (error) {
            console.error('Failed to update session progress:', error)
            throw error
        }
    }

    async getSession(sessionId) {
        try {
            const session = await this.GenerationSession.findOne({
                where: { id: sessionId }
            })
            return session
        } catch (error) {
            console.error('Failed to get session:', error)
            throw error
        }
    }

    async getUserSessions(userId, limit = 10) {
        try {
            return await this.GenerationSession.findAll({
                where: { user_id: userId },
                order: [
                    ['started_at', 'DESC']
                ],
                limit
            })
        } catch (error) {
            console.error('Failed to get user sessions:', error)
            throw error
        }
    }

    async cleanupStaleSessions(maxAgeMinutes = 30) {
        try {
            const cutoffTime = new Date(Date.now() - (maxAgeMinutes * 60 * 1000))
            return await this.GenerationSession.destroy({
                where: {
                    started_at: {
                        [db.Sequelize.Op.lt]: cutoffTime
                    },
                    status: {
                        [db.Sequelize.Op.in]: ['preparing', 'generating']
                    }
                }
            })
        } catch (error) {
            console.error('Failed to cleanup stale sessions:', error)
            throw error
        }
    }

    /**
     * Clean up a specific session
     * @param {string} sessionId - The session ID to clean up
     * @param {string} status - The final status to set
     * @param {string} [errorMessage] - Optional error message
     */
    async cleanupSession(sessionId, status, errorMessage = null) {
        try {
            // Get current session
            const session = await this.getSession(sessionId)

            // Validate status transition
            if (!this.isValidStatusTransition(session.status, status)) {
                throw new Error(this.ERROR_MESSAGES.INVALID_TRANSITION)
            }

            const updateData = {
                status,
                completed_at: new Date()
            }

            if (errorMessage) {
                updateData.error_message = errorMessage
            }

            const [updated] = await this.GenerationSession.update(
                updateData, { where: { id: sessionId } }
            )

            if (!updated) {
                console.warn(`Session ${sessionId} not found during cleanup`)
            }

            return updated
        } catch (error) {
            console.error(`Failed to cleanup session ${sessionId}:`, error)
            throw error
        }
    }
}

module.exports = new GenerationSessionService()