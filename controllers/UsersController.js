const ApiController = require('./ApiController')
const db = require('../db');
const bcrypt = require('bcrypt');
const fileService = require('../services/FileService');
const responseFormatter = require('../services/ResponseFormatter');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');

class UsersController extends ApiController {
    constructor() {
        super('User')
    }

    async nameExists(req, res) {
        try {
            const { name } = req.query;
            console.log('Backend - Received name check request:', { name });

            // Input validation
            if (!name) {
                console.log('Backend - No name provided');
                return res.status(400).json({ error: 'Name parameter is required' });
            }

            const trimmedName = name.trim();
            console.log('Backend - Trimmed name:', { trimmedName });

            if (trimmedName.length < 2 || trimmedName.length > 50) {
                console.log('Backend - Invalid name length:', { length: trimmedName.length });
                return res.status(400).json({ error: 'Name must be between 2 and 50 characters' });
            }

            // URL safety check
            const urlSafePattern = /^[a-zA-Z0-9\s\-_]+$/;
            if (!urlSafePattern.test(trimmedName)) {
                console.log('Backend - Invalid characters in name');
                return res.status(400).json({ error: 'Name contains invalid characters' });
            }

            // Case-insensitive check using MySQL's LOWER()
            console.log('Backend - Checking database for name:', { trimmedName });
            const exists = await db.User.findOne({
                where: db.sequelize.where(
                    db.sequelize.fn('LOWER', db.sequelize.col('name')),
                    db.sequelize.fn('LOWER', trimmedName)
                ),
                attributes: ['id', 'name'] // Include name for debugging
            });

            console.log('Backend - Database query result:', {
                searchedName: trimmedName,
                found: exists ? {
                    id: exists.id,
                    name: exists.name
                } : null,
                exists: Boolean(exists)
            });

            res.json({
                exists: Boolean(exists)
            });
        } catch (err) {
            console.error('Backend - Error checking name existence:', err);
            res.status(500).json({ error: 'Failed to check name existence' });
        }
    }

    async list(req, res) {
        try {
            const whereClause = {};
            if (req.query.name) {
                whereClause.name = req.query.name;
            }

            const users = await db.User.findAll({
                where: whereClause,
                attributes: ['id', 'name', 'email', 'image', 'created_at', 'updated_at']
            });

            res.json(users);
        } catch (err) {
            console.error('Error listing users:', err);
            res.status(500).json({ message: 'Failed to list users' });
        }
    }

    async update(req, res) {
        try {
            const { name, bio } = req.body;
            const userId = req.user.id;

            // Get user with role included
            const user = await db.User.findOne({
                where: { id: userId },
                include: [{ model: db.UserRole, as: 'UserRole', attributes: ['name'] }]
            });

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Handle file upload if present
            if (req.file) {
                try {
                    // Update user with new image path - use full URL
                    const baseUrl = process.env.NODE_ENV === 'development' ?
                        'http://localhost:5000' :
                        process.env.PRODUCTION_URL || 'http://localhost:5000';
                    const imagePath = `${baseUrl}/images/users/${req.file.filename}`;

                    // Verify the file exists
                    const filePath = path.join(__dirname, '../public/images/users', req.file.filename);
                    if (!fs.existsSync(filePath)) {
                        throw new Error('Uploaded file not found');
                    }

                    // Delete old image if it exists
                    if (user.image) {
                        const oldImagePath = user.image.split('/').pop();
                        const oldFilePath = path.join(__dirname, '../public/images/users', oldImagePath);
                        if (fs.existsSync(oldFilePath)) {
                            fs.unlinkSync(oldFilePath);
                        }
                    }

                    // Update the image path
                    await user.set({ image: imagePath });
                    await user.save();

                } catch (err) {
                    console.error('Error handling file upload:', err);
                    return res.status(500).json({ message: 'Failed to process uploaded file' });
                }
            }

            // Update other fields if provided
            const updateData = {};
            if (name) updateData.name = name;
            if (bio !== undefined) updateData.bio = bio;

            if (Object.keys(updateData).length > 0) {
                await user.set(updateData);
                await user.save();
            }

            // Get fresh user data
            const updatedUser = await db.User.findOne({
                where: { id: userId },
                include: [{ model: db.UserRole, as: 'UserRole', attributes: ['name'] }]
            });

            if (!updatedUser) {
                throw new Error('Failed to fetch updated user data');
            }

            const formatted = responseFormatter.formatUser(updatedUser);

            res.json(formatted);
        } catch (err) {
            console.error('Error in UsersController.update:', err);
            res.status(500).json({ message: 'Failed to update user' });
        }
    }
}

module.exports = UsersController;