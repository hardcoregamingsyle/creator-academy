import { formatINR } from "../../shared/format";
import type { FaqGroup, FaqItem } from "../../shared/content";
import { site } from "./site";
import { getSiteSettings, type SiteSettings } from "./data/site-settings";
import { listTrainingDurations, type TrainingDuration } from "./data/training";

export type { FaqGroup, FaqItem };

/** Values a page has already fetched, passed in so they aren't queried twice. */
export type FaqContext = { settings?: SiteSettings; durations?: TrainingDuration[] };

export async function getFaqGroups(known: FaqContext = {}): Promise<FaqGroup[]> {
  const [settings, durations] = await Promise.all([
    known.settings ?? getSiteSettings(),
    known.durations ?? listTrainingDurations(),
  ]);
  const price = `₹${settings.workshopPricePaise / 100}`;
  const trainingFrom = `₹${Math.min(...durations.map((d) => d.paise)) / 100}`;
  const discountedPrice = formatINR(
    settings.workshopPricePaise - Math.round((settings.workshopPricePaise * settings.returningDiscountPercent) / 100),
  );

  return [
    {
      title: "Classes",
      items: [
        {
          q: "What happens in a class?",
          a: "Every workshop is a 90-minute live online class built around one specific skill. Roughly 20% is explaining the idea, 60% is watching it done live step by step, and 20% is you applying it yourself. You leave with something finished — a Short, a thumbnail, a script, a cleaned voice track or a list of ideas.",
        },
        {
          q: "Do I have to take the classes in order?",
          a: "No. Every workshop is standalone and open-entry. Pick exactly the skill you need — you can join Thumbnail Fundamentals without ever taking an editing class.",
        },
        {
          q: "I'm a complete beginner. Is that okay?",
          a: "Yes. The Fundamentals workshops assume no prior experience. If a class needs some background, its page says so clearly.",
        },
        {
          q: "Do you teach CapCut, Canva or other free apps?",
          a: "No. CREATEVA teaches professional software only: Adobe Photoshop and Adobe Premiere Pro. We do not run classes on CapCut, Canva, mobile editing apps or other free tools. If that is what you want to learn, these classes are not the right fit.",
        },
        {
          q: "What software or equipment do I need?",
          a: "Each class page lists what to have ready. Classes are taught in Adobe Photoshop and Adobe Premiere Pro, so have them installed; Adobe offers a free trial of each if you have not bought them yet. A laptop or desktop is recommended for editing and design classes, and the live class room works in any modern browser.",
        },
        {
          q: "Where do the classes happen?",
          a: "Live online on a video call. Your joining link is emailed to you and also appears on your booking page.",
        },
        {
          q: "When are classes held?",
          a: "Mostly on weekends — typically Saturday evenings and Sunday mornings (Indian Standard Time). The schedule rotates based on what students ask for, so check the schedule page for current dates.",
        },
        {
          q: "How big are the groups?",
          a: `Small — a maximum of ${site.defaultCapacity} students per class, so there's time for questions.`,
        },
        {
          q: "Will I get a recording?",
          a: "Classes are designed to be attended live, because the value is in doing the work with guidance. We share key resources after class where it makes sense. Recordings aren't included for now.",
        },
        {
          q: "Who teaches the classes?",
          a: `Classes are taught live by practising creators on the ${site.name} team — people who make content and teach what they actually do.`,
        },
        {
          q: "Do I get a certificate?",
          a: "Not at the moment. We focus on what you make in class — a finished project is more useful to a creator than a certificate.",
        },
      ],
    },
    {
      title: "Booking & payment",
      items: [
        {
          q: "How much does a class cost?",
          a: `Group workshops are ${price} each. There's no subscription and no bundle you have to buy — pay per class.`,
        },
        {
          q: "How do I pay?",
          a: "Through a secure checkout that accepts UPI, debit/credit cards, netbanking and popular wallets. You never need to send money to a personal number.",
        },
        {
          q: "What do I receive after paying?",
          a: "You immediately see a confirmation page with your registration ID, and you receive an email with the class date, time, joining instructions and anything you should prepare.",
        },
        {
          q: "Is there a discount for returning students?",
          a: `Yes. If you attended our immediately previous class, you get ${settings.returningDiscountPercent}% off your next booking (${price} → ${discountedPrice}). Book with the same email address before the next class starts and the discount is applied automatically at checkout. It's a one-time thank-you per class attended.`,
        },
        {
          q: "Can I cancel or reschedule?",
          a: "Yes — cancel at least 24 hours before the class for a full refund or a free move to another date. If we ever cancel or reschedule a class, you choose between a full refund and a free transfer. See the cancellation & refund policy for details.",
        },
        {
          q: "I'm under 18. Can I join?",
          a: "Yes, you're welcome. Please make sure a parent or guardian approves the booking and payment.",
        },
      ],
    },
    {
      title: "Personal training",
      items: [
        {
          q: "How is personal training different from a workshop?",
          a: `Workshops are small group classes on a fixed topic. Personal training is a 1:1 session focused entirely on you — your project, your questions, your pace. Sessions start at ${trainingFrom}.`,
        },
        {
          q: "How do I book personal training?",
          a: "Choose a topic, choose a session length, pick an available time and pay. You'll get a confirmation email, and we'll send your joining link before the session. You can send us files or links to review in advance.",
        },
      ],
    },
    {
      title: "Everything else",
      items: [
        {
          q: "Can I suggest a workshop?",
          a: "Please do. Vote for roadmap workshops on the classes page, or tell us in the feedback form after class. Student requests decide what we teach next.",
        },
        {
          q: "How do I contact you?",
          a: `Email ${site.contactEmail} or use the contact form. We usually reply ${site.replyTime}.`,
        },
      ],
    },
  ];
}

/** A short selection for the home page. */
export async function getHomeFaq(known: FaqContext = {}): Promise<FaqItem[]> {
  const groups = await getFaqGroups(known);
  return [
    groups[0].items[0],
    groups[0].items[1],
    groups[0].items[2],
    groups[1].items[2],
    groups[1].items[4],
    groups[0].items[4],
  ];
}
