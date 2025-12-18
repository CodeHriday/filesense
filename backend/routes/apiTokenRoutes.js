const express = require('express');
const router = express.Router();
const APITokenService = require('../services/APITokenService');
const authenticateToken = require('../middleware/authenticate');
const { systemLogger } = require('../utils/logger');

const apiTokenService = new APITokenService();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, projectId, scopes, rateLimit, rateWindowHours, expiresAt } = req.body;

    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const isAdmin = req.user.is_admin || userRoles.some(r => r?.toLowerCase() === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    if (!name || !scopes || scopes.length === 0) {
      return res.status(400).json({ error: 'Name and scopes are required' });
    }

    const token = await apiTokenService.createToken({
      name,
      userId: req.user.id,
      projectId: projectId || null,
      scopes,
      rateLimit: rateLimit || 100,
      rateWindowHours: rateWindowHours || 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: req.user.id
    });

    res.status(201).json({
      message: 'API token created successfully',
      token: token.token,
      tokenId: token.id,
      tokenPrefix: token.token_prefix,
      warning: 'Save this token now - it will not be shown again'
    });
  } catch (error) {
    systemLogger.error('Failed to create API token', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to create token' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const isAdmin = req.user.is_admin || userRoles.some(r => r?.toLowerCase() === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { userId, projectId, isActive } = req.query;

    const tokens = await apiTokenService.listTokens({
      userId: userId ? parseInt(userId) : undefined,
      projectId: projectId ? parseInt(projectId) : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : null
    });

    res.json({ tokens });
  } catch (error) {
    systemLogger.error('Failed to list API tokens', {
      error: error.message,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to list tokens' });
  }
});

router.get('/:tokenId/usage', authenticateToken, async (req, res) => {
  try {
    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const isAdmin = req.user.is_admin || userRoles.some(r => r?.toLowerCase() === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { tokenId } = req.params;
    const usage = await apiTokenService.checkRateLimit(parseInt(tokenId));

    res.json({ usage });
  } catch (error) {
    systemLogger.error('Failed to get token usage', {
      error: error.message,
      tokenId: req.params.tokenId
    });
    res.status(500).json({ error: 'Failed to get token usage' });
  }
});

router.delete('/:tokenId', authenticateToken, async (req, res) => {
  try {
    const userRoles = Array.isArray(req.user.role) ? req.user.role : [req.user.role];
    const isAdmin = req.user.is_admin || userRoles.some(r => r?.toLowerCase() === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin privileges required' });
    }

    const { tokenId } = req.params;
    await apiTokenService.revokeToken(parseInt(tokenId), req.user.id);

    res.json({ message: 'Token revoked successfully' });
  } catch (error) {
    systemLogger.error('Failed to revoke API token', {
      error: error.message,
      tokenId: req.params.tokenId,
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

module.exports = router;
