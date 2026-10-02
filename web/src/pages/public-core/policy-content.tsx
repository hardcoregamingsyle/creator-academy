import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { SiteInfo } from "@shared/api-types";

/**
 * Legal policy copy. It uses the site info placeholders throughout so it stays
 * accurate once the owner fills in real legal details — never hard-code the
 * brand name, email or business details here.
 */

export const LAST_UPDATED = "24 September 2026";

export const POLICY_SLUGS = ["terms", "privacy", "refunds", "delivery"] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];

export function isPolicySlug(v: string | undefined): v is PolicySlug {
  return v !== undefined && (POLICY_SLUGS as readonly string[]).includes(v);
}

export function policyMeta(site: SiteInfo): Record<PolicySlug, { title: string; description: string }> {
  return {
    terms: { title: "Terms & Conditions", description: `The terms that apply when you book a class or session with ${site.name}.` },
    privacy: { title: "Privacy Policy", description: `What information ${site.name} collects, why, and how it's used.` },
    refunds: { title: "Cancellation & Refund Policy", description: `How cancellations, transfers and refunds work at ${site.name}.` },
    delivery: { title: "Class Delivery Policy", description: `How ${site.name} delivers workshops and personal training — no physical goods.` },
  };
}

export function PolicyContent({ slug, site }: { slug: PolicySlug; site: SiteInfo }) {
  switch (slug) {
    case "terms":
      return <TermsContent site={site} />;
    case "privacy":
      return <PrivacyContent site={site} />;
    case "refunds":
      return <RefundsContent site={site} />;
    case "delivery":
      return <DeliveryContent site={site} />;
  }
}

function PolicySection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

function TermsContent({ site }: { site: SiteInfo }) {
  return (
    <>
      <p>
        These terms apply whenever you book a workshop or personal training session with {site.name}. By booking, you
        agree to them.
      </p>

      <PolicySection heading="1. Who we are">
        <p>
          {site.name} is operated by {site.legal.businessName}, registered at {site.legal.address}. You can reach us
          at {site.contactEmail}.
        </p>
      </PolicySection>

      <PolicySection heading="2. Our services">
        <p>
          We provide live, online, project-based workshops and separate 1:1 personal training sessions, as described
          on this website. Every workshop is standalone — there is no compulsory order to take them in.
        </p>
      </PolicySection>

      <PolicySection heading="3. Bookings & payment">
        <p>
          Bookings are made and paid for through a secure third-party payment provider. Prices are shown in Indian
          Rupees (₹) before you pay. A seat or session slot is only confirmed once payment is successfully completed.
        </p>
      </PolicySection>

      <PolicySection heading="4. Accuracy of information">
        <p>
          When you book, please provide accurate name, email and (where given) phone details — we use these to send
          your confirmation, joining link and any updates about your class.
        </p>
      </PolicySection>

      <PolicySection heading="5. Conduct in class">
        <p>
          We ask everyone to be respectful towards instructors and other students. Class materials and any recording
          of the session may not be recorded, redistributed or shared without our explicit permission.
        </p>
      </PolicySection>

      <PolicySection heading="6. Intellectual property">
        <p>
          Slides, templates and other class materials we provide remain the intellectual property of {site.name}.
          Anything you personally create during a class — your edited video, thumbnail, script or other project — is
          yours.
        </p>
      </PolicySection>

      <PolicySection heading="7. Minors">
        <p>
          Students under 18 are welcome, but a parent or guardian must approve the booking and payment on their
          behalf.
        </p>
      </PolicySection>

      <PolicySection heading="8. Limitation of liability">
        <p>
          We work to deliver every class as described, but to the extent permitted by law, our liability for any
          claim relating to a class or session is limited to the amount you paid for that class or session. We are
          not liable for indirect losses such as lost opportunities or lost profits.
        </p>
      </PolicySection>

      <PolicySection heading="9. Changes to these terms">
        <p>
          We may update these terms from time to time as the academy grows. Continuing to use our services after a
          change means you accept the updated terms — please check this page occasionally.
        </p>
      </PolicySection>

      <PolicySection heading="10. Governing law">
        <p>These terms are governed by the laws of {site.legal.jurisdiction}.</p>
      </PolicySection>

      <PolicySection heading="11. Contact">
        <p>
          Questions about these terms? Email {site.contactEmail} or use our{" "}
          <Link to="/contact">contact form</Link>.
        </p>
      </PolicySection>
    </>
  );
}

function PrivacyContent({ site }: { site: SiteInfo }) {
  return (
    <>
      <p>
        This page explains what personal information {site.name} collects when you use this website, why we collect
        it, and the choices you have.
      </p>

      <PolicySection heading="1. What we collect">
        <ul>
          <li>Your name and email address, when you book a class or session or contact us.</li>
          <li>Your phone number, only if you choose to give it.</li>
          <li>
            Booking and payment status (e.g. pending, paid, refunded) — your card or UPI details are handled directly
            by our payment provider; we never see or store them.
          </li>
          <li>Feedback you submit after a class, including any public comment you choose to share.</li>
          <li>Messages you send us through the contact form.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. Why we collect it">
        <p>
          To confirm and manage your booking, send your joining link and class reminders, reply to your questions,
          apply the returning-student discount where you're eligible, and improve our workshops based on feedback.
        </p>
      </PolicySection>

      <PolicySection heading="3. Legal basis, in plain language">
        <p>
          We process your information because it's necessary to provide the class or session you booked, and because
          you've given us your consent — for example, when you choose to show your feedback publicly.
        </p>
      </PolicySection>

      <PolicySection heading="4. Sharing">
        <p>We share the minimum information necessary with:</p>
        <ul>
          <li>Our payment provider, to process your payment securely.</li>
          <li>Our email provider, to send booking confirmations, joining links and reminders.</li>
          <li>The video platform used to host live classes and personal training sessions.</li>
        </ul>
        <p>We don't sell your personal data to anyone.</p>
      </PolicySection>

      <PolicySection heading="5. Retention">
        <p>
          We keep booking and feedback records for as long as needed to run the academy and meet our accounting and
          legal obligations, and delete or anonymise older records when they're no longer needed.
        </p>
      </PolicySection>

      <PolicySection heading="6. Public feedback — only with consent">
        <p>
          Your feedback is only ever shown on the website if you tick the consent checkbox on the feedback form{" "}
          <strong>and</strong> our team reviews and approves it. You can ask us to remove a published comment at any
          time by emailing us — we'll take it down.
        </p>
      </PolicySection>

      <PolicySection heading="7. Cookies">
        <p>
          We only use essential cookies — specifically, a session cookie that keeps our team signed in to the admin
          dashboard. We don't use advertising or tracking cookies.
        </p>
      </PolicySection>

      <PolicySection heading="8. Children">
        <p>
          If you're under 18, please only book a class with a parent or guardian's consent. We don't knowingly
          collect personal data from children without that consent.
        </p>
      </PolicySection>

      <PolicySection heading="9. Your rights">
        <p>
          You can ask to access, correct or delete the personal data we hold about you at any time — just email{" "}
          {site.contactEmail}.
        </p>
      </PolicySection>

      <PolicySection heading="10. Indian data protection law">
        <p>
          In general terms, we aim to handle your personal data consistently with India's Digital Personal Data
          Protection Act, 2023.
        </p>
      </PolicySection>

      <PolicySection heading="11. Contact">
        <p>
          Privacy questions? Email {site.contactEmail} or use our <Link to="/contact">contact form</Link>.
        </p>
      </PolicySection>
    </>
  );
}

function RefundsContent({ site }: { site: SiteInfo }) {
  return (
    <>
      <p>
        We'd rather be clear upfront about cancellations than surprise you later. Here's exactly how it works for
        workshops and personal training.
      </p>

      <PolicySection heading="1. Group workshops">
        <ul>
          <li>Cancel 24 hours or more before the class starts: full refund, or a free transfer to another date — your choice.</li>
          <li>Cancel less than 24 hours before, or don't show up: no refund. If seats are available, we'll try to move you to a later date once, as a courtesy.</li>
          <li>If we cancel or reschedule a class: full refund or a free transfer — your choice.</li>
          <li>Technical failure on our side that prevents the class from happening: full refund.</li>
          <li>The returning-student discount can't be exchanged for cash.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. Personal training">
        <ul>
          <li>Reschedule for free any time up to 24 hours before your session.</li>
          <li>Cancel 24 hours or more before your session: full refund.</li>
          <li>Cancel less than 24 hours before: no refund.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="3. How to request a refund or transfer">
        <p>
          Email {site.contactEmail} with your registration ID (from your confirmation email) and what you'd like — a
          refund or a transfer to another date.
        </p>
      </PolicySection>

      <PolicySection heading="4. How refunds are paid">
        <p>
          Approved refunds go back to your original payment method, typically within 5–7 business days after
          approval.
        </p>
      </PolicySection>
    </>
  );
}

function DeliveryContent({ site }: { site: SiteInfo }) {
  return (
    <>
      <p>
        {site.name} doesn't ship any physical products. Everything we offer is delivered live, online. Here's exactly
        what to expect after you pay.
      </p>

      <PolicySection heading="1. No physical goods">
        <p>Workshops and personal training are digital services — nothing is shipped to you.</p>
      </PolicySection>

      <PolicySection heading="2. Workshops">
        <p>
          You'll see a confirmation on screen immediately after payment, followed by a confirmation email with your
          registration ID and class details. The joining link for your class is emailed to you before the class
          starts.
        </p>
      </PolicySection>

      <PolicySection heading="3. Personal training">
        <p>
          After booking, you'll receive a confirmation email. The joining link for your 1:1 session is sent to you
          before the session begins.
        </p>
      </PolicySection>

      <PolicySection heading="4. If you don't receive an email">
        <p>
          First, check your spam or promotions folder. You can also look up your booking at{" "}
          <Link to="/booking">/booking</Link> using your registration ID (or have your booking links re-sent to your email), or{" "}
          <Link to="/contact">contact us</Link> and we'll help right away.
        </p>
      </PolicySection>
    </>
  );
}
