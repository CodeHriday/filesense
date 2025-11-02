import React, { useState } from 'react';
import { FaCheckCircle, FaClock, FaTimesCircle, FaUpload, FaFileAlt } from 'react-icons/fa';
import axios from 'axios';
import './ThreeStageApprovalPanel.css';

const ThreeStageApprovalPanel = ({ agreement, currentUser, onUpdate, onError, onSuccess }) => {
  const [comments, setComments] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Determine current stage and user permissions
  const getCurrentStage = () => {
    if (!agreement.vendor_accepted_at) return 'vendor';
    if (!agreement.manager_approved_at) return 'manager';
    if (!agreement.governance_approved_at) return 'governance';
    return 'completed';
  };

  const currentStage = getCurrentStage();

  // Check if user is vendor user for this agreement
  const isVendorUserForAgreement = currentUser.vendor_id === agreement.vendor_id || 
    currentUser.email === agreement.primary_contact_email ||
    currentUser.email === agreement.secondary_contact_email;

  // Check if user is file owner (Vendor Manager)
  const isFileOwner = agreement.file_owner_user_id === currentUser.id;

  // Check if user is governance manager
  const isGovernanceManager = agreement.governance_manager_user_id === currentUser.id;

  // Check if user is admin
  const isAdmin = Array.isArray(currentUser.roles) 
    ? currentUser.roles.some(r => r.toLowerCase() === 'admin')
    : currentUser.role?.toLowerCase() === 'admin';

  // Determine what actions this user can take
  const canVendorAccept = (isVendorUserForAgreement || isAdmin) && currentStage === 'vendor' && !agreement.is_locked && !agreement.vendor_rejected_at;
  const canManagerHandleRejection = (isFileOwner || isAdmin) && agreement.vendor_rejected_at && !agreement.vendor_accepted_at && !agreement.is_locked;
  const canManagerApprove = (isFileOwner || isAdmin) && currentStage === 'manager' && !agreement.is_locked;
  const canGovernanceApprove = (isGovernanceManager || isAdmin) && currentStage === 'governance' && !agreement.is_locked;

  const canTakeAction = canVendorAccept || canManagerHandleRejection || canManagerApprove || canGovernanceApprove;

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
      } else if (canManagerHandleRejection) {
        endpoint = `/api/vendor-agreements/${agreement.id}/manager-handle-rejection`;
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
      if (agreement.vendor_rejected_at) return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.vendor_accepted_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'vendor') return <FaClock className="stage-icon pending-active" />;
      return <FaClock className="stage-icon pending" />;
    } else if (stage === 'manager') {
      if (agreement.manager_rejected_at) return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.manager_approved_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'manager') return <FaClock className="stage-icon pending-active" />;
      if (!agreement.vendor_accepted_at) return <FaClock className="stage-icon disabled" />;
      return <FaClock className="stage-icon pending" />;
    } else if (stage === 'governance') {
      if (agreement.governance_rejected_at) return <FaTimesCircle className="stage-icon rejected" />;
      if (agreement.governance_approved_at) return <FaCheckCircle className="stage-icon approved" />;
      if (currentStage === 'governance') return <FaClock className="stage-icon pending-active" />;
      if (!agreement.manager_approved_at) return <FaClock className="stage-icon disabled" />;
      return <FaClock className="stage-icon pending" />;
    }
  };

  const getStageLabel = (stage) => {
    if (stage === 'vendor') {
      if (agreement.vendor_rejected_at) return 'Rejected';
      if (agreement.vendor_accepted_at) return `Accepted ${new Date(agreement.vendor_accepted_at).toLocaleDateString()}`;
      return 'Pending Vendor Acceptance';
    } else if (stage === 'manager') {
      if (agreement.manager_rejected_at) return 'Rejected';
      if (agreement.manager_approved_at) return `Approved ${new Date(agreement.manager_approved_at).toLocaleDateString()}`;
      if (!agreement.vendor_accepted_at) return 'Awaiting Vendor';
      return 'Pending Manager Approval';
    } else if (stage === 'governance') {
      if (agreement.governance_rejected_at) return 'Rejected';
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
        <div className={`approval-stage ${currentStage === 'vendor' ? 'active' : ''} ${agreement.vendor_accepted_at ? 'completed' : ''} ${agreement.vendor_rejected_at ? 'rejected' : ''}`}>
          <div className="stage-header">
            {getStageIcon('vendor')}
            <div className="stage-info">
              <div className="stage-title">Stage 1: Vendor Acceptance</div>
              <div className="stage-status">{getStageLabel('vendor')}</div>
            </div>
          </div>
        </div>

        <div className="stage-connector"></div>

        <div className={`approval-stage ${currentStage === 'manager' ? 'active' : ''} ${agreement.manager_approved_at ? 'completed' : ''} ${agreement.manager_rejected_at ? 'rejected' : ''}`}>
          <div className="stage-header">
            {getStageIcon('manager')}
            <div className="stage-info">
              <div className="stage-title">Stage 2: Manager Approval</div>
              <div className="stage-status">{getStageLabel('manager')}</div>
            </div>
          </div>
        </div>

        <div className="stage-connector"></div>

        <div className={`approval-stage ${currentStage === 'governance' ? 'active' : ''} ${agreement.governance_approved_at ? 'completed' : ''} ${agreement.governance_rejected_at ? 'rejected' : ''}`}>
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
            <label>Comments {currentStage === 'vendor' ? '(Optional)' : '(Required for rejection)'}:</label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter comments about your decision..."
              rows="4"
            />
          </div>

          {/* Document Upload */}
          <div className="form-group">
            <label>Attach Supporting Documents (Optional):</label>
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
            {canManagerHandleRejection ? (
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
                  onClick={() => handleAction('accept')}
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
                  onClick={() => handleAction('accept')}
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
