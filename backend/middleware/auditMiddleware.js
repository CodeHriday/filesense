const { v4: uuidv4 } = require('uuid');

function sanitizeBody(body) {
  if (!body) return null;
  
  const sanitized = { ...body };
  
  const sensitiveFields = [
    'password', 
    'token', 
    'secret', 
    'apiKey', 
    'api_key',
    'accessToken',
    'refreshToken',
    'privateKey'
  ];
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  return sanitized;
}

function determineAction(method, path) {
  if (method === 'POST') {
    if (path.includes('/upload')) return 'UPLOAD';
    if (path.includes('/execute')) return 'EXECUTE';
    return 'CREATE';
  }
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE';
  if (method === 'DELETE') return 'DELETE';
  if (method === 'GET') {
    if (path.includes('/download')) return 'DOWNLOAD';
    if (path.includes('/preview')) return 'VIEW';
    return 'READ';
  }
  return method;
}

function extractEntityType(path) {
  const patterns = [
    { regex: /\/api\/files/, type: 'file' },
    { regex: /\/api\/schedules/, type: 'schedule' },
    { regex: /\/api\/job-groups/, type: 'job_group' },
    { regex: /\/api\/transformations/, type: 'transformation' },
    { regex: /\/api\/quality/, type: 'quality_check' },
    { regex: /\/api\/profiles/, type: 'profile' },
    { regex: /\/api\/users/, type: 'user' },
    { regex: /\/api\/audit/, type: 'audit' },
    { regex: /\/api\/dbt/, type: 'dbt' }
  ];
  
  for (const pattern of patterns) {
    if (pattern.regex.test(path)) {
      return pattern.type;
    }
  }
  
  return 'unknown';
}

function extractEntityId(req) {
  return req.params.id || 
         req.params.fileId || 
         req.params.scheduleId || 
         req.params.groupId || 
         req.body?.id ||
         null;
}

function shouldLogEndpoint(path) {
  const excludePatterns = [
    /\/health/,
    /\/ping/,
    /\/favicon/,
    /\/static/,
    /\/assets/,
    /\/api\/queue\/metrics/
  ];
  
  return !excludePatterns.some(pattern => pattern.test(path));
}

function createAuditMiddleware(auditService) {
  return async (req, res, next) => {
    if (!shouldLogEndpoint(req.path)) {
      return next();
    }

    const startTime = Date.now();
    const requestId = uuidv4();
    
    req.requestId = requestId;
    req.startTime = startTime;
    
    const auditContext = {
      requestId,
      ipAddress: req.ip || req.connection.remoteAddress,
      sessionId: req.sessionID || req.session?.id || null,
      userId: req.user?.id || req.user?.user_id || null,
      userEmail: req.user?.email || null,
      userRole: req.user?.roles?.[0] || req.user?.role || null,
      apiEndpoint: req.path,
      httpMethod: req.method,
      userAgent: req.headers['user-agent']
    };
    
    req.auditContext = auditContext;
    req.auditService = auditService;
    
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    
    let responseData = null;
    let responseSent = false;
    
    res.json = function(data) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalJson(data);
    };
    
    res.send = function(data) {
      if (!responseSent) {
        responseData = data;
        responseSent = true;
      }
      return originalSend(data);
    };
    
    const logRequest = async () => {
      try {
        const duration = Date.now() - startTime;
        const status = res.statusCode >= 200 && res.statusCode < 400 ? 'SUCCESS' : 'FAILURE';
        
        const entityType = extractEntityType(req.path);
        const entityId = extractEntityId(req);
        const action = determineAction(req.method, req.path);
        
        const metadata = {
          duration_ms: duration,
          statusCode: res.statusCode,
          requestBody: sanitizeBody(req.body),
          queryParams: req.query,
          userAgent: req.headers['user-agent'],
          referrer: req.headers.referer || null
        };
        
        if (res.statusCode >= 400) {
          metadata.error = typeof responseData === 'string' 
            ? responseData 
            : responseData?.error || responseData?.message || 'Unknown error';
        }
        
        await auditService.logAction({
          actionType: action,
          entityType,
          entityId: entityId?.toString() || null,
          operation: req.method,
          newValues: req.method === 'POST' || req.method === 'PUT' 
            ? sanitizeBody(req.body) 
            : null,
          metadata,
          status,
          errorMessage: res.statusCode >= 400 ? metadata.error : null,
          context: req.auditContext
        });
        
      } catch (error) {
        console.error('Error in audit middleware:', error);
      }
    };
    
    res.on('finish', () => {
      logRequest().catch(err => {
        console.error('Failed to log audit entry:', err);
      });
    });
    
    next();
  };
}

module.exports = createAuditMiddleware;
