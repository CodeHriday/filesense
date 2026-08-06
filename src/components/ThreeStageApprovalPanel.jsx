import React, { useState } from 'react';
import { FaCheckCircle, FaClock, FaTimesCircle, FaUpload, FaFileAlt } from 'react-icons/fa';
import axios from 'axios';
import './ThreeStageApprovalPanel.css';
import PropTypes from 'prop-types';

const ThreeStageApprovalPanel = ({ agreement, currentUser, onUpdate, onError, onSuccess }) => {
  const [comments, setComments] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Determine current stage based on approval_status (source of truth)
  const getCurrentStage = () => {
    const status = agreement.approval_status;
    
    // Vendor stage
    if (['draft', 'pending_vendor_acceptance', 'vendor_rejected'].includes(status)) {
      return 'vendor';
    }
    
    // Manager stage
    if (['vendor_accepted', 'manager_rejected', 'governance_rejected'].includes(status)) {
      return 'manager';
    }
    
    // Governance stage
    if (status === 'manager_approved') {
      return 'governance';
    }
    
    // Completed
    if (['governance_approved', 'rejected'].includes(status)) {
      return 'completed';
    }
    
    return 'vendor'; // Default to vendor stage
  };

  const currentStage = getCurrentStage();

  // Check if user is vendor user for this agreement
  const isVendorUserForAgreement = currentUser.vendor_id === agreement.vendor_id || 
    currentUser.email === agreement.primary_contact_email ||
    currentUser.email === agreement.secondary_contact_email;

  // Check if user is the designated manager contact for this agreement (matches backend check)
  const isManagerContact = currentUser.email && agreement.manager_contact &&
    currentUser.email.toLowerCase() === agreement.manager_contact.toLowerCase();

  // Check if user is governance manager
  const isGovernanceManager = agreement.governance_manager_user_id === currentUser.id;

  // Admin check: only users with the literal 'Admin' role are considered admins.
  // Do NOT use broad permission checks like users:write — vendor managers also hold those.
  const isAdmin = Array.isArray(currentUser.roles)
    ? currentUser.roles.some(r => r.toLowerCase() === 'admin')
    : currentUser.role?.toLowerCase() === 'admin';

  // Determine what actions this user can take
  const canVendorAccept = (isVendorUserForAgreement || isAdmin) && currentStage === 'vendor' && !agreement.is_locked && agreement.approval_status !== 'vendor_rejected';
  const canManagerHandleVendorRejection = (isManagerContact || isAdmin) && agreement.approval_status === 'vendor_rejected' && !agreement.is_locked;
  const canManagerHandleGovernanceRejection = (isManagerContact || isAdmin) && agreement.approval_status === 'governance_rejected' && !agreement.is_locked;
  const canManagerApprove = (isManagerContact || isAdmin) && currentStage === 'manager' && !agreement.is_locked;
  const canGovernanceApprove = (isGovernanceManager || isAdmin) && currentStage === 'governance' && !agreement.is_locked;

  const canTakeAction = canVendorAccept || canManagerHandleVendorRejection || canManagerHandleGovernanceRejection || canManagerApprove || canGovernanceApprove;

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleAction = async (action) => {
    if ((action === 'reject' || action === 'send-to-vendor') && !comments.trim()) {
      onError('Comments are required for this action');
      return;
    }

    try {
      setUploading(true);
      
      // Prepare form data with documents
      const formData = new FormData();
      formData.append('action', action);
      formData.append('comments', comments);
      
      attachments.forEach((file) => {
        formData.append('documents', file);
      });

      let endpoint = '';
      if (canVendorAccept) {
        endpoint = `/api/vendor-agreements/${agreement.id}/vendor-action`;
      } else if (canManagerHandleVendorRejection) {
        endpoint = `/api/vendor-agreements/${agreement.id}/manager-handle-rejection`;
      } else if (canManagerHandleGovernanceRejection) {
        endpoint = `/api/vendor-agreements/${agreement.id}/manager-handle-governance-rejection`;
      } else if (canManagerApprove) {
        endpoint = `/api/vendor-agreements/${agreement.id}/manager-action`;
      } else if (canGovernanceApprove) {
        endpoint = `/api/vendor-agreements/${agreement.id}/governance-action`;
      }

      const response = await axios.post(endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      onSuccess(response.data.message || `Action completed successfully!`);
      setComments('');
      setAttachments([]);
      
      // Refresh agreement details
      if (onUpdate) {
        await onUpdate();
      }
      
    } catch (error) {
      console.error(`Error performing action:`, error);
      onError(error.response?.data?.error || `Failed to perform action`);
    } finally {
      setUploading(false);
    }
  };

  const getStageIcon = (stage) => {
    if (stage === 'vendor') {
      if (agreement.approval_status === 'vendor_rejected') return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.vendor_approved_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'vendor') return <FaClock className="stage-icon pending-active" />;
      return <FaClock className="stage-icon pending" />;
    } else if (stage === 'manager') {
      if (agreement.approval_status === 'manager_rejected') return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.manager_approved_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'manager') return <FaClock className="stage-icon pending-active" />;
      if (!agreement.vendor_approved_at) return <FaClock className="stage-icon disabled" />;
      return <FaClock className="stage-icon pending" />;
    } else if (stage === 'governance') {
      if (agreement.approval_status === 'governance_rejected') return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.governance_approved_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'governance') return <FaClock className="stage-icon pending-active" />;
      if (!agreement.manager_approved_at) return <FaClock className="stage-icon disabled" />;
      return <FaClock className="stage-icon pending" />;
    }
  };

  const getStageLabel = (stage) => {
    if (stage === 'vendor') {
      if (agreement.approval_status === 'vendor_rejected') return 'Rejected';
      if (agreement.vendor_approved_at) return `Accepted ${new Date(agreement.vendor_approved_at).toLocaleDateString()}`;
      return 'Pending Vendor Acceptance';
    } else if (stage === 'manager') {
      if (agreement.approval_status === 'manager_rejected') return 'Rejected';
      if (agreement.manager_approved_at) return `Approved ${new Date(agreement.manager_approved_at).toLocaleDateString()}`;
      if (!agreement.vendor_approved_at) return 'Awaiting Vendor';
      return 'Pending Manager Approval';
    } else if (stage === 'governance') {
      if (agreement.approval_status === 'governance_rejected') return 'Rejected';
      if (agreement.governance_approved_at) return `Approved ${new Date(agreement.governance_approved_at).toLocaleDateString()}`;
      if (!agreement.manager_approved_at) return 'Awaiting Manager';
      return 'Pending Governance Approval';
    }
  };

  return (
    <div className="three-stage-approval-panel">
      <h3>Approval Workflow</h3>
      
      {/* Progress Tracker */}
      <div className="approval-stages">
        <div className={`approval-stage ${currentStage === 'vendor' ? 'active' : ''} ${['vendor_accepted', 'manager_approved', 'manager_rejected', 'governance_approved', 'governance_rejected'].includes(agreement.approval_status) ? 'completed' : ''} ${agreement.approval_status === 'vendor_rejected' ? 'rejected' : ''}`}>
          <div className="stage-header">
            {getStageIcon('vendor')}
            <div className="stage-info">
              <div className="stage-title">Stage 1: Vendor Acceptance</div>
              <div className="stage-status">{getStageLabel('vendor')}</div>
            </div>
          </div>
        </div>

        <div className="stage-connector"></div>

        <div className={`approval-stage ${currentStage === 'manager' ? 'active' : ''} ${['manager_approved', 'governance_approved', 'governance_rejected'].includes(agreement.approval_status) ? 'completed' : ''} ${agreement.approval_status === 'manager_rejected' ? 'rejected' : ''}`}>
          <div className="stage-header">
            {getStageIcon('manager')}
            <div className="stage-info">
              <div className="stage-title">Stage 2: Manager Approval</div>
              <div className="stage-status">{getStageLabel('manager')}</div>
            </div>
          </div>
        </div>

        <div className="stage-connector"></div>

        <div className={`approval-stage ${currentStage === 'governance' ? 'active' : ''} ${agreement.approval_status === 'governance_approved' ? 'completed' : ''} ${agreement.approval_status === 'governance_rejected' ? 'rejected' : ''}`}>
          <div className="stage-header">
            {getStageIcon('governance')}
            <div className="stage-info">
              <div className="stage-title">Stage 3: Governance Approval</div>
              <div className="stage-status">{getStageLabel('governance')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Panel */}
      {canTakeAction && (
        <div className="approval-action-panel">
          <h4>Take Action</h4>
          
          {/* Comments */}
          <div className="form-group">
            <label htmlFor="approval-comments">Comments {currentStage === 'vendor' ? '(Optional)' : '(Required for rejection)'}:</label>
            <textarea
              id="approval-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter comments about your decision..."
              rows="4"
            />
          </div>

          {/* Document Upload */}
          <div className="form-group">
            <label htmlFor="approval-docs">Attach Supporting Documents (Optional):</label>
            <div className="file-upload-area">
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                id="approval-docs"
                style={{ display: 'none' }}
              />
              <label htmlFor="approval-docs" className="file-upload-button">
                <FaUpload /> Choose Files
              </label>
              
              {attachments.length > 0 && (
                <div className="attached-files">
                  {attachments.map((file, index) => (
                    <div key={index} className="attached-file">
                      <FaFileAlt />
                      <span>{file.name}</span>
                      <button 
                        type="button" 
                        onClick={() => removeAttachment(index)}
                        className="remove-file-btn"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            {canManagerHandleVendorRejection ? (
              <>
                <button
                  className="approve-btn-stage"
                  onClick={() => handleAction('override-and-approve')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Override & Send to Governance'}
                </button>
                <button
                  className="reject-btn-stage"
                  onClick={() => handleAction('send-to-vendor')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Send Back to Vendor'}
                </button>
              </>
            ) : canManagerHandleGovernanceRejection ? (
              <>
                <button
                  className="approve-btn-stage"
                  onClick={() => handleAction('resubmit')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Revise & Resubmit to Governance'}
                </button>
                <button
                  className="approve-btn-stage warning-action"
                  onClick={() => handleAction('send-to-vendor')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Send Back to Vendor'}
                </button>
                <button
                  className="reject-btn-stage"
                  onClick={() => handleAction('close')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Close Agreement'}
                </button>
              </>
            ) : canVendorAccept ? (
              <>
                <button
                  className="approve-btn-stage"
                  onClick={() => handleAction('accept')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Accept Agreement'}
                </button>
                <button
                  className="reject-btn-stage"
                  onClick={() => handleAction('reject')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Reject Agreement'}
                </button>
              </>
            ) : canManagerApprove ? (
              <>
                <button
                  className="approve-btn-stage"
                  onClick={() => handleAction('approve')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Approve & Send to Governance'}
                </button>
                <button
                  className="reject-btn-stage"
                  onClick={() => handleAction('reject')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Reject Agreement'}
                </button>
              </>
            ) : canGovernanceApprove ? (
              <>
                <button
                  className="approve-btn-stage"
                  onClick={() => handleAction('approve')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  className="reject-btn-stage"
                  onClick={() => handleAction('reject')}
                  disabled={uploading}
                >
                  {uploading ? 'Processing...' : 'Reject'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      {agreement.is_locked && (
        <div className="locked-notice">
          🔒 This agreement is locked and cannot be modified.
        </div>
      )}
    </div>
  );
};

export default ThreeStageApprovalPanel;

ThreeStageApprovalPanel.propTypes = {
  agreement: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    approval_status: PropTypes.string,
    is_locked: PropTypes.bool,
    vendor_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    primary_contact_email: PropTypes.string,
    secondary_contact_email: PropTypes.string,
    file_owner_user_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    governance_manager_user_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    vendor_approved_at: PropTypes.string,
    manager_approved_at: PropTypes.string,
    governance_approved_at: PropTypes.string,
  }).isRequired,
  currentUser: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    vendor_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    email: PropTypes.string,
    roles: PropTypes.arrayOf(PropTypes.string),
    role: PropTypes.string,
  }).isRequired,
  onUpdate: PropTypes.func,
  onError: PropTypes.func,
  onSuccess: PropTypes.func,
};

ThreeStageApprovalPanel.defaultProps = {
  onUpdate: null,
  onError: () => {},
  onSuccess: () => {},
};
