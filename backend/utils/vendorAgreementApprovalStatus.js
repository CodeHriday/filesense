/**
 * Terminal agreement states that authorize contract-bound file activity.
 *
 * `governance_approved` is produced by the legacy three-stage workflow,
 * while `fully_approved` is produced by the configurable approval chain.
 */
const FINAL_APPROVED_AGREEMENT_STATUSES = Object.freeze([
  'governance_approved',
  'fully_approved'
]);

function isFinalApprovedAgreementStatus(status) {
  return FINAL_APPROVED_AGREEMENT_STATUSES.includes(status);
}

module.exports = {
  FINAL_APPROVED_AGREEMENT_STATUSES,
  isFinalApprovedAgreementStatus
};