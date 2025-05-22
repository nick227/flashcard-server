const db = require('../db');

class TagsController {
    async list(req, res) {
        try {
            const tags = await db.Tag.findAll();
            res.json(tags);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async get(req, res) {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) {
                return res.status(404).json({ error: 'Tag not found' });
            }
            res.json(tag);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req, res) {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const tag = await db.Tag.create({ name });
            res.status(201).json(tag);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { name } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) {
                return res.status(404).json({ error: 'Tag not found' });
            }
            await tag.update({ name });
            res.json(tag);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const tag = await db.Tag.findByPk(req.params.id);
            if (!tag) {
                return res.status(404).json({ error: 'Tag not found' });
            }
            await tag.destroy();
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = TagsController;