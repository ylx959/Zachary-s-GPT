# Lumen Labs IT Security Policy

This policy applies to all employees, contractors and interns who use Lumen Labs systems.

## Passwords and accounts

Passwords must be at least 14 characters long. Passwords are no longer rotated on a fixed schedule; they must be changed immediately if there is any sign that they were exposed. Reusing a company password on any external website is forbidden. All employees use the company password manager, Vaultkeeper, to generate and store credentials.

Multi-factor authentication is mandatory for email, source control, the cloud console and the HR portal. Hardware security keys are required for anyone with production access. SMS codes are not accepted as a second factor.

## Device security

Company laptops must use full-disk encryption and lock automatically after 5 minutes of inactivity. Operating system security updates must be installed within 7 days of release; devices that fall more than 14 days behind lose access to internal systems until they are patched.

Personal devices may access email and chat only through the managed mobile app. Personal laptops must never be used to access source code or customer data.

## Network access

The office guest Wi-Fi network is called LumenGuest and is isolated from internal systems. Internal systems are reachable from outside the office only through the corporate VPN, which uses the WireGuard protocol. VPN sessions disconnect after 12 hours and require re-authentication.

## Data classification

Data is classified into four levels: Public, Internal, Confidential and Restricted. Customer personal data and production credentials are Restricted. Restricted data may never be copied to a laptop, pasted into third-party AI tools, or shared in chat channels. Confidential documents may be shared externally only with a signed NDA in place.

## Incident reporting

Suspected security incidents must be reported to the security team within one hour of discovery, through the #sec-incidents channel or by calling the security hotline. Examples include phishing emails that were clicked, lost devices, and accidentally shared credentials. Reporting quickly is never punished; hiding an incident is a disciplinary matter.

Lost or stolen laptops and phones must additionally be reported to IT within 24 hours so the device can be wiped remotely.

## Access reviews

Managers review the access rights of their team every quarter. Access to production systems expires automatically after 90 days unless it is renewed. When someone leaves the company, all of their accounts are disabled on their last working day before 18:00.

## Phishing simulations

The security team runs a phishing simulation every month. Employees who click on a simulated phishing link are asked to complete a 15-minute refresher training within one week.

## Backups

Production databases are backed up every 6 hours and backups are kept for 35 days. Restore drills are carried out once per quarter, and the target restore time for a full database is under 4 hours.

## Software installation

Employees may install software from the internal self-service catalogue without approval. Software that is not in the catalogue must be requested through an IT ticket and is reviewed by the security team within five working days. Browser extensions are limited to an approved list because extensions can read every page a user visits. Pirated or cracked software is strictly forbidden on any device that accesses company systems.

## Email security

External emails are marked with a yellow "External" banner. Attachments with macros are blocked automatically, and links in emails are rewritten so that they are checked again when clicked. Employees must never forward company email automatically to a personal mailbox; automatic forwarding rules to external addresses are disabled centrally.

If an email asks for a change of bank details, an urgent payment, or gift cards, the request must be verified by phone using a number from the internal directory, never a number contained in the email itself.

## Physical security

Office access badges must be worn visibly at all times. Visitors sign in at reception, receive a temporary badge and must be accompanied by their host in all non-public areas. Tailgating, that is letting someone without a badge follow you through a door, is not allowed even for colleagues you recognise.

Screens must be locked whenever an employee leaves their desk, even for a short time. A clean desk policy applies in shared spaces: printed documents classified as Confidential or Restricted must be locked away at the end of the day and disposed of in the locked shredding bins.

## Remote work security

When working from public places such as cafés or airports, employees must use the corporate VPN and a privacy screen filter for their laptop. Home routers must use WPA2 or WPA3 encryption and must not use the default administrator password. Video calls about Confidential matters must not be held in public places where others can overhear.

## Cloud and SaaS tools

New cloud services that will store company data must pass a security review before any data is uploaded. The review checks single sign-on support, data location, encryption and the vendor's certifications. Free personal accounts on file-sharing services must not be used for company documents, even temporarily.

## Generative AI tools

Employees may use the company-approved AI assistant, which runs under an enterprise agreement that prevents training on company data. Public AI chatbots may be used for general questions only, never with source code, customer information or internal documents. Code suggested by AI tools must be reviewed with the same care as code written by a colleague, and licences of generated code must be checked when in doubt.

## Secrets management

API keys, database passwords and certificates are stored in the central secrets manager and injected into services at runtime. Secrets must never be committed to source control; a pre-commit scanner blocks the most common key formats, and the security team scans all repositories every night. A secret that was committed by mistake must be rotated immediately, even if the commit was reverted within minutes, because the history may already have been copied.

## Penetration tests and bug bounty

An external firm performs a penetration test of the public API and the Lumen Home app twice a year. Critical findings must be fixed within 7 days and high findings within 30 days. Lumen Labs also runs a public bug bounty programme; payouts range from 200 USD for low-severity issues to 10,000 USD for critical vulnerabilities that allow access to customer data.

## Policy exceptions

Exceptions to this policy must be requested in writing from the Chief Information Security Officer. Approved exceptions are recorded in the risk register and expire after 6 months unless they are renewed.
