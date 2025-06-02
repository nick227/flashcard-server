const EventEmitter = require('events')

class QueueService extends EventEmitter {
    constructor() {
        super()
        this.queue = []
        this.processing = false
        this.lastRequestTime = null
        this.requestsPerMinute = 10000 // OpenAI's rate limit for GPT-4
        this.minTimeBetweenRequests = (60 * 1000) / this.requestsPerMinute
        this.maxTokensPerMinute = 300000 // GPT-4 token limit
        this.currentTokensThisMinute = 0
        this.tokenResetInterval = setInterval(() => {
                this.currentTokensThisMinute = 0
            }, 60000) // Reset token count every minute
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Cleanup every minute
    }

    async addToQueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({
                task,
                resolve,
                reject,
                timestamp: Date.now()
            })
            this.processQueue()
        })
    }

    async processQueue() {
        if (this.processing || this.queue.length === 0) return

        this.processing = true
        const { task, resolve, reject } = this.queue[0]

        try {
            // Enforce OpenAI rate limit
            await this.enforceRateLimit()

            // Execute task
            const result = await task()

            // Update token usage based on actual usage
            if (result.usage && result.usage.total_tokens) {
                this.currentTokensThisMinute += result.usage.total_tokens

                // Check if we've exceeded the token limit
                if (this.currentTokensThisMinute > this.maxTokensPerMinute) {
                    throw new Error('Token limit exceeded. Please try again in a minute.')
                }
            }

            resolve(result)
        } catch (error) {
            reject(error)
        } finally {
            // Remove processed task
            this.queue.shift()
            this.processing = false

            // Process next task if any
            if (this.queue.length > 0) {
                this.processQueue()
            }
        }
    }

    async enforceRateLimit() {
        const now = Date.now()

        // Check token limit
        if (this.currentTokensThisMinute >= this.maxTokensPerMinute) {
            const waitTime = 60000 - (now % 60000) // Wait until next minute
            await new Promise(resolve => setTimeout(resolve, waitTime))
            this.currentTokensThisMinute = 0
        }

        // Check request rate limit
        if (this.lastRequestTime) {
            const timeSinceLastRequest = now - this.lastRequestTime
            if (timeSinceLastRequest < this.minTimeBetweenRequests) {
                await new Promise(resolve =>
                    setTimeout(resolve, this.minTimeBetweenRequests - timeSinceLastRequest)
                )
            }
        }
        this.lastRequestTime = Date.now()
    }

    getQueueLength() {
        return this.queue.length
    }

    getQueueStatus() {
        const oldestRequest = this.queue.length > 0 ? this.queue[0].timestamp : null
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            oldestRequest,
            lastRequestTime: this.lastRequestTime,
            requestsPerMinute: this.requestsPerMinute,
            currentTokensThisMinute: this.currentTokensThisMinute,
            maxTokensPerMinute: this.maxTokensPerMinute,
            estimatedTimeToNextRequest: this.lastRequestTime ?
                Math.max(0, this.minTimeBetweenRequests - (Date.now() - this.lastRequestTime)) : 0
        }
    }

    cleanup() {
        const now = Date.now()
        this.queue = this.queue.filter(item => {
            if (now - item.timestamp > 300000) { // 5 minutes
                item.reject(new Error('Request abandoned'))
                return false
            }
            return true
        })
        if (this.tokenResetInterval) {
            clearInterval(this.tokenResetInterval)
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
        }
    }
}

// Create singleton instance
const queueService = new QueueService()

// Handle process termination
process.on('SIGTERM', () => {
    queueService.cleanup()
})

process.on('SIGINT', () => {
    queueService.cleanup()
})

module.exports = queueService