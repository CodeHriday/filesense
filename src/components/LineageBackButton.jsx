import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import './LineageBackButton.css';

/**
 * Renders a "Back to Lineage" pill button only when the user arrived from the
 * visual lineage page. The source URL is stored in React Router location state
 * (set by NodeDetailDrawer when the redirect icon is clicked) so the button
 * disappears on normal navigation and on page reload.
 */
const LineageBackButton = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const fromLineage = location.state?.fromLineage;
  if (!fromLineage) return null;

  return (
    <button
      className="lineage-back-btn"
      onClick={() => navigate(fromLineage)}
      title="Return to the lineage graph"
    >
      <FiArrowLeft size={13} />
      Back to Lineage
    </button>
  );
};

export default LineageBackButton;
