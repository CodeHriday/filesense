# Email Deliverability Setup Guide

This guide explains how to configure SPF, DKIM, and DMARC records for email providers to ensure high deliverability and prevent emails from being marked as spam.

## Table of Contents
- [SMTP Provider Configuration](#smtp-provider-configuration)
- [Gmail OAuth2 Configuration](#gmail-oauth2-configuration)
- [Outlook OAuth2 Configuration](#outlook-oauth2-configuration)
- [SendGrid Configuration](#sendgrid-configuration)
- [AWS SES Configuration](#aws-ses-configuration)
- [Azure Communication Services Configuration](#azure-communication-services-configuration)
- [Google Cloud Email Configuration](#google-cloud-email-configuration)

---

## SMTP Provider Configuration

### SPF Record
Add a TXT record to your domain's DNS:

```
Type: TXT
Name: @
Value: v=spf1 ip4:<your-smtp-server-ip> ~all
```

Example for specific IP:
```
v=spf1 ip4:203.0.113.5 ~all
```

### DKIM Setup
1. Generate DKIM keys using OpenSSL:
```bash
openssl genrsa -out dkim_private.pem 2048
openssl rsa -in dkim_private.pem -pubout -out dkim_public.pem
```

2. Add DKIM TXT record:
```
Type: TXT
Name: default._domainkey
Value: v=DKIM1; k=rsa; p=<your-public-key>
```

3. Configure your SMTP server to sign emails with the private key.

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com
```

### Configuration Notes
- Use port 587 with STARTTLS for secure connections
- Enable `requireTLS: true` in SMTP configuration
- Verify SPF/DKIM/DMARC using: https://mxtoolbox.com/

---

## Gmail OAuth2 Configuration

### Prerequisites
1. Create a Google Cloud Project: https://console.cloud.google.com/
2. Enable Gmail API
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URI: `https://<your-domain>/api/email-connections/oauth2/gmail/callback`

### SPF Record
Gmail handles SPF automatically when sending via OAuth2. No manual SPF configuration needed.

### DKIM Setup
Gmail automatically signs emails with DKIM when using OAuth2. Verify at:
- Google Workspace Admin Console → Apps → Google Workspace → Gmail → Authenticate email

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; sp=quarantine; adkim=r; aspf=r
```

### OAuth2 Scopes Required
```
https://www.googleapis.com/auth/gmail.send
```

### Verification
- Send test email and check headers for `ARC-Authentication-Results`
- Gmail automatically includes SPF/DKIM signatures

---

## Outlook OAuth2 Configuration

### Prerequisites
1. Register app in Azure Portal: https://portal.azure.com/
2. Add redirect URI: `https://<your-domain>/api/email-connections/oauth2/outlook/callback`
3. Enable Mail.Send permission (Application or Delegated)
4. Admin consent for Mail.Send

### SPF Record
Microsoft 365 requires SPF record:
```
Type: TXT
Name: @
Value: v=spf1 include:spf.protection.outlook.com ~all
```

### DKIM Setup
1. Go to Microsoft 365 Admin Center → Settings → Domains
2. Enable DKIM signing for your domain
3. Microsoft generates CNAME records automatically:
```
Type: CNAME
Name: selector1._domainkey
Value: selector1-<domain>._domainkey.<tenant>.onmicrosoft.com

Type: CNAME
Name: selector2._domainkey
Value: selector2-<domain>._domainkey.<tenant>.onmicrosoft.com
```

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@yourdomain.com
```

### OAuth2 Scopes Required
```
https://graph.microsoft.com/Mail.Send
```

---

## SendGrid Configuration

### Prerequisites
1. Create SendGrid account: https://signup.sendgrid.com/
2. Generate API key with Mail Send permission
3. Verify sender identity (single sender or domain authentication)

### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:sendgrid.net ~all
```

If you already have SPF:
```
v=spf1 include:sendgrid.net include:_spf.google.com ~all
```

### DKIM Setup
1. Go to SendGrid Dashboard → Settings → Sender Authentication
2. Authenticate Your Domain
3. Add the 3 CNAME records provided:
```
Type: CNAME
Name: s1._domainkey
Value: s1.domainkey.u<id>.wl<id>.sendgrid.net

Type: CNAME
Name: s2._domainkey
Value: s2.domainkey.u<id>.wl<id>.sendgrid.net

Type: CNAME
Name: em<id>
Value: u<id>.wl<id>.sendgrid.net
```

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; pct=100
```

### Link Branding (Optional)
Configure link branding to avoid "via sendgrid.net" in email clients:
1. Settings → Sender Authentication → Link Branding
2. Add CNAME record provided

---

## AWS SES Configuration

### Prerequisites
1. Create AWS account and verify domain in SES console
2. Request production access (remove sandbox mode)
3. Generate SMTP credentials or use AWS SDK with IAM user

### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all
```

### DKIM Setup
1. Go to AWS SES Console → Verified Identities → Your Domain
2. Enable "Easy DKIM"
3. Add the 3 CNAME records provided:
```
Type: CNAME
Name: <token1>._domainkey.yourdomain.com
Value: <token1>.dkim.amazonses.com

Type: CNAME
Name: <token2>._domainkey.yourdomain.com
Value: <token2>.dkim.amazonses.com

Type: CNAME
Name: <token3>._domainkey.yourdomain.com
Value: <token3>.dkim.amazonses.com
```

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; ruf=mailto:dmarc-forensics@yourdomain.com; fo=1
```

### Custom MAIL FROM Domain (Recommended)
Set custom MAIL FROM domain to improve deliverability:
1. SES Console → Verified Identities → MAIL FROM Domain
2. Add MX record:
```
Type: MX
Name: bounce.yourdomain.com
Value: 10 feedback-smtp.<region>.amazonses.com
```

---

## Azure Communication Services Configuration

### Prerequisites
1. Create Azure Communication Services resource
2. Configure Email Communication Service
3. Add verified domain

### SPF Record
```
Type: TXT
Name: @
Value: v=spf1 include:spf.communication.azure.com ~all
```

### DKIM Setup
1. Azure Portal → Communication Services → Email → Domains
2. Configure DKIM for your domain
3. Add CNAME records provided:
```
Type: CNAME
Name: selector1._domainkey
Value: selector1-<domain>._domainkey.azurecomm.net

Type: CNAME
Name: selector2._domainkey
Value: selector2-<domain>._domainkey.azurecomm.net
```

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
```

### Managed Identity (Recommended)
Use Azure Managed Identity instead of connection strings for production:
1. Enable system-assigned managed identity
2. Grant "Contributor" role to Communication Services resource
3. Use DefaultAzureCredential in application

---

## Google Cloud Email Configuration

### Prerequisites
1. Create Google Cloud project
2. Enable Gmail API or use SMTP relay
3. Configure service account or OAuth2 credentials

### SPF Record (SMTP Relay)
```
Type: TXT
Name: @
Value: v=spf1 include:_spf.google.com ~all
```

### DKIM Setup
1. Google Workspace Admin Console → Apps → Google Workspace → Gmail
2. Authenticate email → Generate new record
3. Add TXT record:
```
Type: TXT
Name: google._domainkey
Value: v=DKIM1; k=rsa; p=<generated-public-key>
```

### DMARC Record
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; sp=quarantine; adkim=s; aspf=s
```

### SMTP Relay Setup
1. Google Admin Console → Apps → Google Workspace → Gmail → Routing
2. Configure SMTP relay service
3. Allowed senders: Only registered App users or Only addresses in my domains
4. Authentication: Require SMTP Authentication

---

## Testing Email Deliverability

### Tools
1. **MX Toolbox**: https://mxtoolbox.com/SuperTool.aspx
   - Check SPF, DKIM, DMARC records
   - Test blacklists

2. **Mail Tester**: https://www.mail-tester.com/
   - Send test email and get spam score (10/10 is perfect)
   - Detailed deliverability report

3. **DMARC Analyzer**: https://dmarcian.com/dmarc-inspector/
   - Validate DMARC policy
   - View aggregate reports

### Verification Commands
```bash
# Check SPF
dig TXT yourdomain.com +short | grep spf1

# Check DKIM
dig TXT default._domainkey.yourdomain.com +short

# Check DMARC
dig TXT _dmarc.yourdomain.com +short
```

### Email Headers to Verify
Send a test email and check headers for:
- `Authentication-Results`: Should show SPF=pass, DKIM=pass, DMARC=pass
- `Received-SPF`: Should show "pass"
- `DKIM-Signature`: Should be present with valid signature

---

## Best Practices

### General
1. **Warm up new sending domains**: Start with low volume (10-20 emails/day), gradually increase over 2-4 weeks
2. **Monitor bounce rates**: Keep hard bounces below 2%, soft bounces below 5%
3. **Maintain list hygiene**: Remove invalid addresses immediately
4. **Use consistent "From" addresses**: Don't frequently change sender addresses
5. **Implement feedback loops**: Subscribe to ISP complaint feedback loops

### DMARC Policy Progression
```
Phase 1 (Month 1-2):  p=none     (monitor only)
Phase 2 (Month 3-4):  p=quarantine (quarantine suspicious)
Phase 3 (Month 5+):   p=reject   (reject unauthorized)
```

### Content Guidelines
1. Maintain text-to-image ratio of 60:40
2. Avoid spam trigger words (FREE, URGENT, CLICK HERE)
3. Include unsubscribe link (required by CAN-SPAM)
4. Use valid Reply-To address
5. Test emails across providers (Gmail, Outlook, Yahoo)

### Reputation Management
1. Monitor sender score: https://www.senderscore.org/
2. Check IP reputation: https://talosintelligence.com/reputation_center
3. Set up reverse DNS (PTR record) for sending IPs
4. Use dedicated IPs for high-volume sending (>100k emails/month)

---

## Troubleshooting

### Emails Going to Spam
1. Verify SPF/DKIM/DMARC are passing
2. Check sender reputation scores
3. Review email content for spam triggers
4. Ensure unsubscribe link is present
5. Warm up domain if new

### DKIM Signature Failures
1. Verify DKIM record with `dig TXT selector._domainkey.yourdomain.com`
2. Check selector name matches configuration
3. Ensure no extra spaces in DNS TXT record
4. Verify private key matches public key

### High Bounce Rates
1. Implement double opt-in for new subscribers
2. Use email validation service
3. Remove hard bounces immediately
4. Monitor engagement metrics (opens, clicks)

### Provider-Specific Issues
- **Gmail**: Ensure Gmail Postmaster Tools setup for monitoring
- **Outlook**: Check Smart Network Data Services (SNDS) for IP reputation
- **Yahoo**: Monitor Complaint Feedback Loop reports

---

## Compliance Requirements

### CAN-SPAM Act (USA)
1. Include valid physical postal address
2. Clear unsubscribe mechanism
3. Process unsubscribe requests within 10 days
4. Accurate "From" and "Subject" lines
5. Identify message as advertisement (if applicable)

### GDPR (EU)
1. Obtain explicit consent before sending
2. Provide easy opt-out mechanism
3. Honor unsubscribe requests immediately
4. Include privacy policy link
5. Maintain records of consent

### CASL (Canada)
1. Obtain express or implied consent
2. Include sender identification
3. Provide unsubscribe mechanism
4. Honor unsubscribe within 10 days

---

## Monitoring and Alerts

### Key Metrics to Track
1. **Delivery Rate**: Should be >95%
2. **Bounce Rate**: Hard bounces <2%, soft bounces <5%
3. **Complaint Rate**: Should be <0.1%
4. **Open Rate**: Baseline varies by industry (15-25% typical)
5. **Click Rate**: 2-5% typical

### Set Up Alerts For
- Bounce rate spike (>5%)
- Complaint rate increase (>0.5%)
- DMARC failures (>10%)
- Blacklist additions
- Delivery rate drop (<90%)

### Recommended Monitoring Tools
1. **SendGrid/AWS SES/Azure built-in analytics**: Real-time delivery metrics
2. **Google Postmaster Tools**: Gmail-specific insights
3. **Microsoft SNDS**: Outlook/Hotmail reputation data
4. **DMARC aggregate reports**: Weekly authentication summaries

---

## Production Checklist

Before going live:
- [ ] SPF record added and verified
- [ ] DKIM configured and signing emails
- [ ] DMARC policy set to p=none minimum
- [ ] Domain verified with email provider
- [ ] Test emails sent to Gmail, Outlook, Yahoo
- [ ] All test emails pass authentication (SPF/DKIM/DMARC)
- [ ] Unsubscribe link tested
- [ ] Bounce handling configured
- [ ] Complaint feedback loops enabled
- [ ] Legal footer with address added
- [ ] Privacy policy link included
- [ ] Sending limits configured (rate limiting)
- [ ] Monitoring and alerts set up

---

## Additional Resources

### Documentation
- [SPF RFC 7208](https://tools.ietf.org/html/rfc7208)
- [DKIM RFC 6376](https://tools.ietf.org/html/rfc6376)
- [DMARC RFC 7489](https://tools.ietf.org/html/rfc7489)

### Provider Guides
- [Gmail Best Practices](https://support.google.com/mail/answer/81126)
- [Outlook Deliverability](https://sendersupport.olc.protection.outlook.com/pm/)
- [SendGrid Deliverability](https://docs.sendgrid.com/ui/sending-email/deliverability)
- [AWS SES Best Practices](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)

### Community
- [Email Geeks Slack](https://email.geeks.chat/)
- [Litmus Community](https://litmus.com/community)
