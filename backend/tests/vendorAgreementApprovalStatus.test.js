const fs = require('fs');
const path = require('path');
const {
  FINAL_APPROVED_AGREEMENT_STATUSES,
  isFinalApprovedAgreementStatus
} = require('../utils/vendorAgreementApprovalStatus');

describe('final vendor agreement approval statuses', () => {
  test.each([
    'governance_approved',
    'fully_approved'
  ])('recognizes %s as an upload-authorizing terminal status', (status) => {
    expect(FINAL_APPROVED_AGREEMENT_STATUSES).toContain(status);
    expect(isFinalApprovedAgreementStatus(status)).toBe(true);
  });

  test.each([
    'draft',
    'pending_approval',
    'vendor_approved',
    'manager_approved',
    'rejected',
    null
  ])('does not authorize incomplete or rejected status %p', (status) => {
    expect(isFinalApprovedAgreementStatus(status)).toBe(false);
  });

  test('uses the shared terminal-status list in every contract upload gate', () => {
    const serverSource = fs.readFileSync(path.resolve(__dirname, '../../server.js'), 'utf8');
    const workerSource = fs.readFileSync(
      path.resolve(__dirname, '../workers/fileProcessingWorker.js'),
      'utf8'
    );

    expect(serverSource.match(/FINAL_APPROVED_AGREEMENT_STATUSES/g)).toHaveLength(5);
    expect(workerSource.match(/FINAL_APPROVED_AGREEMENT_STATUSES/g)).toHaveLength(2);
    expect(serverSource.match(/approval_status = ANY\(\$\d+::text\[\]\)/g)).toHaveLength(4);
    expect(workerSource).toContain('approval_status = ANY($2::text[])');
  });
});