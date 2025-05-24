const ApiController = require('./ApiController')
const db = require('../db');
const bcrypt = require('bcrypt');
const fileService = require('../services/FileService');
const responseFormatter = require('../services/ResponseFormatter');
const path = require('path');
const fs = require('fs');

class UsersController extends ApiController {
    constructor() {
        super('User')
    }

    async list(req, res) {
        try {
            const whereClause = {};
            if (req.query.name) {
                whereClause.name = req.query.name;
            }

            const users = await db.User.findAll({
                where: whereClause,
                attributes: ['id', 'name', 'email', 'bio', 'image', 'created_at', 'updated_at']
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