const db = require('../db');

class NewsletterController {
    async subscribe(req, res) {
        try {
            const { email } = req.body;
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                return res.status(400).json({ error: 'Valid email is required.' });
            }
            // Check if already subscribed
            const existing = await db.NewsletterSubscriber.findOne({ where: { email } });
            if (existing) {
                return res.status(409).json({ error: 'Email already subscribed.' });
            }
            const subscriber = await db.NewsletterSubscriber.create({ email });
            res.status(201).json({ success: true, subscriber });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = new NewsletterController();