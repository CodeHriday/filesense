import React, { useState } from 'react';
import { FaCheckCircle, FaClock, FaTimesCircle } from 'react-icons/fa';
import axios from 'axios';
import './DynamicApprovalPanel.css';
import PropTypes from 'prop-types';

/**
 * DynamicApprovalPanel
 * Renders a configurable N-step approval chain (backend: approval_chain_config).
 * Falls back to nothing when chain config is absent — caller shows ThreeStageApprovalPanel instead.
 */
const DynamicApprovalPanel = ({
  agreement,
  currentUser,
  stepDecisions,
  users,
  isAdmin: isAdminProp,
  onUpdate,
  onError,
  onSuccess,
}) => {
  const [activeAction, setActiveAction] = useState(null); // 'approve' | 'reject'
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const chainConfig = agreement?.approval_chain_config;
  const steps = chainConfig?.steps || [];
  const currentStep = agreement.current_approval_step; // 1-based, null before submission
  const status = agreement.approval_status;
  const currentVersion = agreement.version;

  if (!steps.length) return null;

  // Isolate decisions that belong to the current approval round.
  // Primary: filter by chain_submitted_at — only decisions recorded AFTER the last
  // chain submission timestamp belong to this round. This correctly handles
  // resubmissions that pre-date the per-round version increment.
  // Fallback: filter by agreement_version for agreements with no submission timestamp.
  const chainSubmittedAt = agreement.chain_submitted_at
    ? new Date(agreement.chain_submitted_at)
    : null;

  const currentRoundDecisions = chainSubmittedAt
    ? stepDecisions.filter((d) => d.decided_at && new Date(d.decided_at) >= chainSubmittedAt)
    : currentVersion != null
      ? stepDecisions.filter(
          (d) =>
            d.agreement_version === currentVersion ||
            String(d.agreement_version) === String(currentVersion)
        )
      : stepDecisions;

  /* ── Helpers ─────────────────────────────────────────── */

  const getUserName = (userId) => {
    const uid = parseInt(userId, 10);
    const u = users.find((u) => u.id === uid || parseInt(u.id, 10) === uid);
    if (!u) return `User #${userId}`;
    if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
    return u.fullName || u.username || u.email || `User #${userId}`;
  };

  // Use current-round decisions for panel logic (chips, quorum, hasVoted)
  const getDecisionsForStep = (stepNumber) =>
    currentRoundDecisions.filter((d) => d.step_number === stepNumber);

  // Use the parent-supplied isAdmin flag, which mirrors the backend's userHasAdminAccess:
  // hasPermission('users:write') || hasPermission('project_management:write') || hasRole('Admin')
  // Handles permission-based admins and object-form roles that inline role-string parsing cannot.
  const isAdmin = isAdminProp === true;

  const isOwner =
    String(agreement.file_owner_user_id) === String(currentUser.id);

  // Backend also allows created_by (requester) to submit/re-submit
  const isCreator =
    agreement.created_by != null &&
    String(agreement.created_by) === String(currentUser.id);

  /* ── Derive action capabilities ───────────────────────── */

  const canSubmit =
    (isAdmin || isOwner || isCreator) &&
    status !== 'pending_approval' &&
    status !== 'governance_approved' &&
    status !== 'fully_approved' &&
    !agreement.is_locked;

  const activeStepConfig = steps.find((s) => s.step_number === currentStep);

  const isAssignedToActiveStep =
    status === 'pending_approval' &&
    activeStepConfig?.approver_user_ids?.some(
      (id) => parseInt(id, 10) === parseInt(currentUser.id, 10)
    );

  const hasVoted =
    status === 'pending_approval' &&
    currentRoundDecisions.some(
      (d) =>
        d.step_number === currentStep &&
        parseInt(d.approver_user_id, 10) === parseInt(currentUser.id, 10)
    );

  // Only explicitly listed assignees may vote — admin bypass removed because the backend
  // rejects non-assignees and showing the form misleads users into a guaranteed error.
  const canVote =
    status === 'pending_approval' &&
    !hasVoted &&
    !agreement.is_locked &&
    isAssignedToActiveStep;

  /* ── Step state derivation ────────────────────────────── */

  const getStepState = (step) => {
    const n = step.step_number;
    // Both fully_approved (chain flow) and governance_approved (legacy flow) are terminal approved
    if (status === 'fully_approved' || status === 'governance_approved') return 'approved';
    if (status === 'pending_approval') {
      if (n < currentStep) return 'approved';
      if (n === currentStep) return 'active';
      return 'waiting';
    }
    if (status === 'rejected') {
      const decs = getDecisionsForStep(n);
      if (decs.some((d) => d.action === 'reject')) return 'rejected';
      if (n < (currentStep || 1)) return 'approved';
      if (n === (currentStep || 1)) return 'rejected';
      return 'waiting';
    }
    return 'waiting'; // pre-submission
  };

  /* ── Handlers ─────────────────────────────────────────── */

  const handleSubmitForApproval = async () => {
    try {
      setSubmitting(true);
      const response = await axios.post(
        `/api/vendor-agreements/${agreement.id}/submit-for-approval`
      );
      onSuccess(response.data.message || 'Contract submitted for approval chain');
      if (onUpdate) await onUpdate();
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to submit for approval');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (action) => {
    if (action === 'reject' && !comments.trim()) {
      onError('Comments are required when rejecting');
      return;
    }
    try {
      setSubmitting(true);
      const response = await axios.post(
        `/api/vendor-agreements/${agreement.id}/step-decision`,
        { action, comments: comments.trim() }
      );
      onSuccess(
        response.data.message ||
          (action === 'approve' ? 'Approved successfully' : 'Rejected successfully')
      );
      setComments('');
      setActiveAction(null);
      if (onUpdate) await onUpdate();
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to record decision');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Status label ─────────────────────────────────────── */

  const statusLabel =
    status === 'pending_approval'
      ? `Step ${currentStep} of ${steps.length} active`
      : status === 'fully_approved' || status === 'governance_approved'
      ? 'Fully Approved ✓'
      : status === 'rejected'
      ? 'Rejected'
      : 'Not yet submitted';

  /* ── Render ───────────────────────────────────────────── */

  return (
    <div className="dynamic-approval-panel">
      {/* Header */}
      <div className="dap-header">
        <h3>Approval Chain</h3>
        <span className={`dap-status-pill dap-status-${status}`}>{statusLabel}</span>
      </div>

      {/* Steps */}
      <div className="dap-steps">
        {steps.map((step, idx) => {
          const state = getStepState(step);
          const decisions = getDecisionsForStep(step.step_number);
          const approvedCount = decisions.filter((d) => d.action === 'approve').length;
          const totalAssigned = step.approver_user_ids?.length || 0;
          const required = step.require_all ? totalAssigned : 1;

          return (
            <React.Fragment key={step.step_number}>
              <div className={`dap-step dap-step-${state}`}>
                {/* Step header row */}
                <div className="dap-step-header">
                  <div className="dap-step-icon">
                    {state === 'approved' && (
                      <FaCheckCircle className="dap-icon-approved" />
                    )}
                    {state === 'rejected' && (
                      <FaTimesCircle className="dap-icon-rejected" />
                    )}
                    {(state === 'active' || state === 'waiting') && (
                      <FaClock
                        className={
                          state === 'active'
                            ? 'dap-icon-active'
                            : 'dap-icon-waiting'
                        }
                      />
                    )}
                  </div>
                  <div className="dap-step-meta">
                    <div className="dap-step-name">
                      Step {step.step_number}: {step.name}
                    </div>
                    <div className="dap-step-subtitle">
                      {step.require_all
                        ? 'All approvers must approve'
                        : 'Any one approver is sufficient'}
                      {' · '}
                      {totalAssigned} assignee
                      {totalAssigned !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Progress bar — only shown on active step */}
                  {state === 'active' && (
                    <div className="dap-progress-wrap">
                      <span className="dap-progress-label">
                        {approvedCount}/{required} approved
                      </span>
                      <div className="dap-progress-bar">
                        <div
                          className="dap-progress-fill"
                          style={{
                            width: `${
                              required > 0
                                ? Math.min(100, (approvedCount / required) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Approver list */}
                <div className="dap-approvers">
                  {step.approver_user_ids?.map((userId) => {
                    const dec = decisions.find(
                      (d) =>
                        parseInt(d.approver_user_id, 10) === parseInt(userId, 10)
                    );
                    // For any-one-sufficient steps: once ≥1 approval satisfies the step,
                    // non-voting assignees are moot — show "optional-na" instead of "pending".
                    const stepSatisfied =
                      !step.require_all &&
                      decisions.some((d) => d.action === 'approve' || d.action === 'approved');
                    const voteState = dec
                      ? dec.action
                      : stepSatisfied
                      ? 'optional-na'
                      : 'pending';
                    return (
                      <div key={userId} className="dap-approver-row">
                        <div className="dap-avatar">
                          {getUserName(userId).charAt(0).toUpperCase()}
                        </div>
                        <div className="dap-approver-info">
                          <span className="dap-approver-name">
                            {getUserName(userId)}
                          </span>
                          {dec?.comments && (
                            <span className="dap-approver-comment">
                              &ldquo;{dec.comments}&rdquo;
                            </span>
                          )}
                        </div>
                        <span className={`dap-vote-chip dap-vote-${voteState}`}>
                          {voteState === 'optional-na' ? 'Optional-NA' : voteState}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {idx < steps.length - 1 && (
                <div className="dap-step-connector" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Vote action panel — shown to assigned approvers on the active step */}
      {canVote && (
        <div className="dap-action-panel">
          <h4>
            Your Decision — Step {currentStep}: {activeStepConfig?.name}
          </h4>

          {activeAction ? (
            <>
              <div className="dap-form-group">
                <label htmlFor="dap-comments">
                  Comments{' '}
                  {activeAction === 'reject' ? '(required)' : '(optional)'}:
                </label>
                <textarea
                  id="dap-comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder={
                    activeAction === 'reject'
                      ? 'Explain the reason for rejection…'
                      : 'Optional comments…'
                  }
                  rows={3}
                />
              </div>
              <div className="action-buttons">
                <button
                  className={
                    activeAction === 'approve'
                      ? 'approve-btn-stage'
                      : 'reject-btn-stage'
                  }
                  onClick={() => handleVote(activeAction)}
                  disabled={submitting}
                >
                  {submitting
                    ? 'Saving…'
                    : activeAction === 'approve'
                    ? 'Confirm Approve'
                    : 'Confirm Reject'}
                </button>
                <button
                  className="dap-cancel-btn"
                  onClick={() => {
                    setActiveAction(null);
                    setComments('');
                  }}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="action-buttons">
              <button
                className="approve-btn-stage"
                onClick={() => setActiveAction('approve')}
              >
                Approve
              </button>
              <button
                className="reject-btn-stage"
                onClick={() => setActiveAction('reject')}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submit / re-submit button */}
      {canSubmit && (
        <div className="dap-submit-section">
          {status === 'rejected' && (
            <p className="dap-rejected-note">
              This contract was rejected. You may update the approval chain
              configuration and re-submit.
            </p>
          )}
          <button
            className="dap-submit-btn"
            onClick={handleSubmitForApproval}
            disabled={submitting}
          >
            {submitting
              ? 'Submitting…'
              : status === 'rejected'
              ? 'Re-submit for Approval'
              : 'Submit for Chain Approval'}
          </button>
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

DynamicApprovalPanel.propTypes = {
  agreement: PropTypes.object.isRequired,
  currentUser: PropTypes.object.isRequired,
  stepDecisions: PropTypes.array,
  users: PropTypes.array,
  onUpdate: PropTypes.func,
  onError: PropTypes.func,
  onSuccess: PropTypes.func,
};

DynamicApprovalPanel.defaultProps = {
  stepDecisions: [],
  users: [],
  onUpdate: null,
  onError: () => {},
  onSuccess: () => {},
};

export default DynamicApprovalPanel;
