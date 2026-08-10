// Mail stub — TEMPORARY implementation: no real SMTP/resend provider is wired up
// yet (founder decision 2026-08-10). "Sending" logs the message to the server
// console, which lands in journald (`journalctl -u microstudio`). When a real
// provider is added (Gmail SMTP or Resend), swap the body of sendEmail.
export interface MailMessage {
  to: string
  subject: string
  text: string
}

export async function sendMail(msg: MailMessage): Promise<boolean> {
  // TEMP: log instead of deliver — wire real provider here later.
  // eslint-disable-next-line no-console
  console.log(`\n[MAIL-STUB] to=${msg.to}\nsubject=${msg.subject}\n${msg.text}\n`)
  return true
}