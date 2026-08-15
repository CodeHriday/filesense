import React, { useState, useEffect } from 'react';
import { FaPlus, FaTimes, FaChevronDown, FaChevronUp, FaSave } from 'react-icons/fa';
import axios from 'axios';
import './ApprovalChainConfig.css';
import PropTypes from 'prop-types';

const MAX_STEPS = 5;

const emptyStep = (stepNumber) => ({
  step_number: stepNumber,
  name: `Step ${stepNumber}`,
  approver_user_ids: [],
  require_all: false,
});

/**
 * ApprovalChainConfig
 * Collapsible editor for configuring the N-step approval chain on a vendor contract.
 * Only rendered in edit mode (requires agreement.id).
 * Saves independently via PUT /:id/approval-chain.
 */
const ApprovalChainConfig = ({ agreement, users, onSave, onError, onSuccess }) => {
  const [expanded, setExpanded] = useState(false);
  const [steps, setSteps] = useState([emptyStep(1)]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [searchTerms, setSearchTerms] = useState({});

  /* ── Load existing config when expanded ──────────────────── */
  useEffect(() => {
    if (!expanded) return;
    const existing = agreement?.approval_chain_config?.steps;
    if (existing?.length) {
      setSteps(
        existing.map((s) => ({
          ...s,
          approver_user_ids: Array.isArray(s.approver_user_ids)
            ? s.approver_user_ids
            : [],
        }))
      );
    } else {
      setSteps([emptyStep(1)]);
    }
    setDirty(false);
    setSearchTerms({});
  }, [expanded, agreement?.id]);

  /* ── Step mutations ─────────────────────────────────────── */

  const addStep = () => {
    if (steps.length >= MAX_STEPS) return;
    setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
    setDirty(true);
  };

  const removeStep = (idx) => {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );
    setDirty(true);
  };

  const updateStep = (idx, field, value) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
    setDirty(true);
  };

  const toggleApprover = (stepIdx, userId) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== stepIdx) return s;
        const ids = s.approver_user_ids || [];
        const already = ids.includes(userId);
        return {
          ...s,
          approver_user_ids: already
            ? ids.filter((id) => id !== userId)
            : [...ids, userId],
        };
      })
    );
    setDirty(true);
  };

  /* ── Save ───────────────────────────────────────────────── */

  const handleSave = async () => {
    for (const step of steps) {
      if (!step.name.trim()) {
        onError(`Step ${step.step_number} needs a name`);
        return;
      }
      if (!step.approver_user_ids?.length) {
        onError(`Step ${step.step_number} needs at least one approver`);
        return;
      }
    }

    try {
      setSaving(true);
      await axios.put(
        `/api/vendor-agreements/${agreement.id}/approval-chain`,
        { steps }
      );
      onSuccess('Approval chain saved');
      setDirty(false);
      if (onSave) onSave({ steps });
    } catch (err) {
      onError(err.response?.data?.error || 'Failed to save approval chain');
    } finally {
      setSaving(false);
    }
  };

  /* ── Filtered user list per step ────────────────────────── */

  const getFilteredUsers = (stepIdx) => {
    const q = (searchTerms[stepIdx] || '').toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name =
        u.first_name && u.last_name
          ? `${u.first_name} ${u.last_name}`
          : u.fullName || u.username || '';
      return (
        name.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    });
  };

  const getUserLabel = (u) => {
    const name =
      u.first_name && u.last_name
        ? `${u.first_name} ${u.last_name}`
        : u.fullName || u.username || '';
    const detail = u.email || u.username || '';
    return name ? `${name} (${detail})` : detail || `User #${u.id}`;
  };

  /* ── Configured badge ───────────────────────────────────── */
  const configuredSteps = agreement?.approval_chain_config?.steps?.length || 0;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div className="approval-chain-config">
      {/* Collapsible header */}
      <div
        className="acc-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="acc-title-row">
          <span className="acc-title">Approval Chain</span>
          {configuredSteps > 0 && !expanded && (
            <span className="acc-configured-badge">
              {configuredSteps} step{configuredSteps !== 1 ? 's' : ''} configured
            </span>
          )}
        </div>
        <div className="acc-chevron">
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </div>
      </div>

      {expanded && (
        <div className="acc-body">
          <p className="acc-description">
            Configure up to {MAX_STEPS} sequential approval steps. Each step can
            require <strong>any one</strong> approver or <strong>all</strong>{' '}
            approvers to vote before the chain advances.
          </p>

          <div className="acc-steps">
            {steps.map((step, idx) => (
              <div key={idx} className="acc-step-card">
                {/* Step card header */}
                <div className="acc-step-top">
                  <span className="acc-step-num-label">Step {step.step_number}</span>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      className="acc-remove-step"
                      onClick={() => removeStep(idx)}
                      title="Remove this step"
                    >
                      <FaTimes />
                    </button>
                  )}
                </div>

                {/* Step name */}
                <div className="acc-field">
                  <label htmlFor={`acc-name-${idx}`}>Step Name</label>
                  <input
                    id={`acc-name-${idx}`}
                    type="text"
                    value={step.name}
                    onChange={(e) => updateStep(idx, 'name', e.target.value)}
                    placeholder="e.g., Manager Review, Legal Sign-off"
                    maxLength={100}
                  />
                </div>

                {/* Quorum toggle */}
                <div className="acc-field">
                  <label>Quorum</label>
                  <div className="acc-quorum-toggle">
                    <button
                      type="button"
                      className={`acc-quorum-btn${!step.require_all ? ' active' : ''}`}
                      onClick={() => updateStep(idx, 'require_all', false)}
                    >
                      Any one approver
                    </button>
                    <button
                      type="button"
                      className={`acc-quorum-btn${step.require_all ? ' active' : ''}`}
                      onClick={() => updateStep(idx, 'require_all', true)}
                    >
                      All must approve
                    </button>
                  </div>
                </div>

                {/* Approver picker */}
                <div className="acc-field">
                  <label>
                    Approvers{' '}
                    <span className="acc-count">
                      ({step.approver_user_ids?.length || 0} selected)
                    </span>
                  </label>
                  <input
                    type="text"
                    className="acc-search"
                    placeholder="Search by name or email…"
                    value={searchTerms[idx] || ''}
                    onChange={(e) =>
                      setSearchTerms((prev) => ({ ...prev, [idx]: e.target.value }))
                    }
                  />
                  <div className="acc-approver-list">
                    {getFilteredUsers(idx).map((u) => {
                      const selected =
                        step.approver_user_ids?.includes(u.id) || false;
                      return (
                        <label
                          key={u.id}
                          className={`acc-approver-option${selected ? ' selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleApprover(idx, u.id)}
                          />
                          <span>{getUserLabel(u)}</span>
                        </label>
                      );
                    })}
                    {getFilteredUsers(idx).length === 0 && (
                      <span className="acc-no-results">No users match</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="acc-footer">
            {steps.length < MAX_STEPS && (
              <button
                type="button"
                className="acc-add-step-btn"
                onClick={addStep}
              >
                <FaPlus /> Add Step
              </button>
            )}
            <button
              type="button"
              className="acc-save-btn"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? (
                'Saving…'
              ) : (
                <>
                  <FaSave /> Save Chain
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

ApprovalChainConfig.propTypes = {
  agreement: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    approval_chain_config: PropTypes.object,
  }).isRequired,
  users: PropTypes.array,
  onSave: PropTypes.func,
  onError: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};

ApprovalChainConfig.defaultProps = {
  users: [],
  onSave: null,
};

export default ApprovalChainConfig;
