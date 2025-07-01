const ApiController = require('./ApiController')
const db = require('../db');
const bcrypt = require('bcrypt');
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

            // Input validation
            if (!name) {
                return res.status(400).json({ error: 'Name parameter is required' });
            }

            const trimmedName = name.trim();

            if (trimmedName.length < 2 || trimmedName.length > 50) {
                return res.status(400).json({ error: 'Name must be between 2 and 50 characters' });
            }

            // URL safety check
            const urlSafePattern = /^[a-zA-Z0-9\s\-_]+$/;
            if (!urlSafePattern.test(trimmedName)) {
                return res.status(400).json({ error: 'Name contains invalid characters' });
            }

            // Case-insensitive check using MySQL's LOWER()
            const exists = await db.User.findOne({
                where: db.sequelize.where(
                    db.sequelize.fn('LOWER', db.sequelize.col('name')),
                    db.sequelize.fn('LOWER', trimmedName)
                ),
                attributes: ['id', 'name'] // Include name for debugging
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
                // Use case-insensitive search like nameExists method
                whereClause.name = db.sequelize.where(
                    db.sequelize.fn('LOWER', db.sequelize.col('name')),
                    db.sequelize.fn('LOWER', req.query.name.trim())
                );
            }

            const users = await db.User.findAll({
                where: whereClause,
                attributes: ['id', 'name', 'email', 'image', 'bio', 'created_at', 'updated_at']
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
                    // Upload to Cloudinary
                    const CloudinaryService = require('../services/CloudinaryService');
                    const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, { folder: 'user-profile-images' });
                    if (!uploadResult || !uploadResult.secure_url) {
                        throw new Error('Cloudinary upload failed');
                    }

                    // Delete old Cloudinary image if it exists and is a Cloudinary URL
                    if (user.image && user.image.includes('cloudinary.com')) {
                        // Extract publicId from the URL
                        const urlParts = user.image.split('/');
                        const publicIdWithExt = urlParts.slice(-2).join('/').split('.')[0];
                        try {
                            await CloudinaryService.deleteImage(publicIdWithExt);
                        } catch (err) {
                            console.warn('Failed to delete old Cloudinary image:', err);
                        }
                    }

                    // Update the image path to Cloudinary URL
                    await user.set({ image: uploadResult.secure_url });
                    await user.save();
                } catch (err) {
                    console.error('Error handling Cloudinary upload:', err);
                    return res.status(500).json({ message: 'Failed to process uploaded file' });
                }
            }

            // Update other fields if provided
            const updateData = {};
            if (name) updateData.name = name;
            if (bio !== undefined) {
                updateData.bio = bio;
            }

            if (Object.keys(updateData).length > 0) {
                await user.update(updateData);
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

    async updateRole(req, res) {
        try {
            const { role } = req.body;
            const userId = req.user.id;

            // Validate role
            const validRoles = ['user', 'educator', 'admin'];
            if (!validRoles.includes(role)) {
                return res.status(400).json({ message: 'Invalid role' });
            }

            // Get user with role included
            const user = await db.User.findOne({
                where: { id: userId },
                include: [{ model: db.UserRole, as: 'UserRole', attributes: ['name'] }]
            });

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Get role ID
            const userRole = await db.UserRole.findOne({
                where: { name: role }
            });

            if (!userRole) {
                return res.status(400).json({ message: 'Invalid role' });
            }

            // Update role
            await user.set({ role_id: userRole.id });
            await user.save();

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
            console.error('Error in UsersController.updateRole:', err);
            res.status(500).json({ message: 'Failed to update user role' });
        }
    }

    async count(req, res) {
        try {
            const count = await db.User.count();
            res.json({ count });
        } catch (err) {
            console.error('Error counting users:', err);
            res.status(500).json({ message: 'Failed to count users' });
        }
    }

    async newestUser(req, res) {
        try {
            const newestUser = await db.User.findOne({
                attributes: ['id', 'name', 'image', 'bio', 'created_at'],
                include: [{
                    model: db.UserRole,
                    as: 'UserRole',
                    attributes: ['name']
                }],
                order: [
                    ['created_at', 'DESC']
                ]
            });

            if (!newestUser) {
                return res.status(404).json({ message: 'No users found' });
            }

            // Format the response
            const formattedUser = {
                id: newestUser.id,
                name: newestUser.name,
                image: newestUser.image,
                bio: newestUser.bio || null,
                role: newestUser.UserRole ? newestUser.UserRole.name : null,
                created_at: newestUser.created_at
            };

            res.json(formattedUser);
        } catch (err) {
            console.error('Error fetching newest user:', err);
            res.status(500).json({ message: 'Failed to fetch newest user' });
        }
    }
}

module.exports = UsersController;