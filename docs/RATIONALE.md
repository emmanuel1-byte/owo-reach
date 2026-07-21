# Why Owó Reach — The Rationale

*The case for this project: the problem it solves, why now, and why it wins. Written to be argued with. If any paragraph stops being true, revisit the plan.*

---

## The problem, stated plainly

Nigeria runs on payouts that never touch a bank account. According to EFInA's access-to-finance research, tens of millions of Nigerian adults remain financially excluded or underserved no bank account, no card, often no smartphone. Yet these are precisely the people that thousands of organisations need to pay every month: the cooperative settling farm-gate prices with smallholders, the NGO distributing stipends and cash aid, the church running a welfare list, the construction firm paying day labourers, the market association returning contributions.

Today those organisations solve this the only way they can: someone withdraws a brick of cash and physically distributes it. That method fails on every axis that matters. It is unsafe a person carrying payroll cash through Lagos or rural Kaduna is a target. It is unauditable a signature on a paper list proves nothing to a donor or an auditor. It is leaky reconciling who actually received what, after the fact, is guesswork. And it is slow a payout that should take minutes consumes days of staff time. The digital tools that exist assume the problem away: every payroll product, every disbursement API integration, every fintech payout flow begins with "enter the recipient's account number." For a huge share of the intended recipients, that field cannot be filled.

So the problem is not "payments are hard in Nigeria." Payments are increasingly excellent in Nigeria. The problem is narrower and sharper: **the last mile of organisational money stops where bank accounts stop, and the people past that line are the ones who can least afford unreliable payment.**

## Why this solution actually solves it

Owó Reach removes the assumption instead of working around it. An organisation uploads one list clean or messy and every person on it gets paid through whichever rail reaches them. Recipients with accounts are verified by name enquiry and paid by instant transfer. Recipients without accounts receive a Monnify Paycode by SMS: a 10-digit code redeemable for cash at any Moniepoint agent, of which there are hundreds of thousands across the country far closer to most Nigerians than any bank branch. The recipient needs no app, no smartphone, no onboarding, no KYC ceremony. They need the phone they already own and a walk to the agent they already know.

Crucially, the solution treats the part everyone ignores what happens after send as the core product. Every transfer and every code lives in a tracked lifecycle: issued, redeemed, expiring, expired, reissued, cancelled. The organisation gets what cash-in-envelopes can never give them: a real-time, auditable answer to "did everyone get paid?", and one-click recovery when someone didn't. The AI layer earns its place at the messiest boundary, turning WhatsApp-pasted lists and ragged spreadsheets into verified beneficiary data and flagging the duplicate or the mismatched account name *before* money moves rather than after.

This is not a hypothetical user base. Cash transfer programming is a standard modality in Nigerian humanitarian and social-protection work, cooperatives are a legal and cultural fixture, and the informal economy employs the majority of the workforce. The buyers exist; the pain is chronic; the current alternative is a stack of cash.

## Why it competes — and wins

**It is built on the feature only the sponsor has.** Paycode is exclusive to Monnify. Most submissions will orbit Checkout, Payment Links, and reserved accounts the features every gateway offers and every tutorial covers. A project whose entire thesis depends on Monnify's unique capability tells the judges, who are Monnify's own team, a story no other entry can tell: *your API reaches people no other payment API in Nigeria can reach, and here is the product that proves it.* That is simultaneously a product pitch and a love letter to the sponsor's roadmap. It's also durable differentiation a competitor can't copy the idea onto Paystack or Flutterwave, because the rail doesn't exist there.

**It maps onto every judging criterion by construction, not by garnish.** Practical value: a documented, unsolved operational problem with named user types. Clarity and storytelling: the entire demo is one human narrative Martins, who has no bank account, paid in ninety seconds rather than a feature tour. Technical depth: a webhook-driven state machine, HMAC-validated events, the full paycode lifecycle including the masked/clear-code authorization flow, sandbox MFA handled as a deliberate maker-checker step, money as integer kobo throughout. Clean setup: SQLite and Bun mean a judge cold-clones the repo and is running in four commands, no Docker, no database server.

**Its AI is load-bearing, not decorative.** The brief explicitly warns that AI slop is frowned upon. Our two AI features chaos ingestion and the pre-flight risk brief do work that is genuinely hard without a language model and directly protect money movement. There is no chatbot. That restraint *is* the differentiation in a field where half the entries will bolt a chat window onto a checkout page.

**Its risk profile is honest and managed.** The single genuine unknown whether the Paycode API behaves fully in sandbox is front-loaded into a three-hour day-1 spike with a pre-committed fallback (SMS plus reserved accounts preserves the same product story). Nothing else in the build depends on unverified assumptions. Most hackathon losses are execution failures late in the week; our riskiest hour is the first one, by design.

**Even a loss is a win.** The stated team goal is a product worth launching publicly. This one stands on its own after the challenge: the problem doesn't expire on July 21, the repo demonstrates payments engineering judgment to anyone who reads it, and "payroll for the informal economy" is a sentence investors and employers remember.

## The steelman — what a skeptical judge asks, and our answers

*"Isn't this just a wrapper on Monnify's APIs?"* Every fintech is a wrapper on rails; the product is the workflow. The ingestion, verification, lifecycle management, and reconciliation are the parts organisations cannot get from an API reference — that is exactly the gap between an API and a solution, which is what the challenge asks us to demonstrate.

*"The SMS is stubbed and it's sandbox-only."* By the rules, live APIs are prohibited, and we say plainly in the UI and README what is simulated. Judges reward honesty about seams; they punish hidden ones.

*"Would anyone pay for this?"* Organisations already pay for this in staff days, transport, shrinkage, and audit failures. A flat ₦100 per cash payout with a complete audit trail undercuts the true cost of an envelope by an order of magnitude.

## The sentence

**Owó Reach is payroll for the informal economy: one list in, everyone paid — bank account or not — with every naira accounted for, built on the one payment rail in Nigeria that reaches all the way to cash.**
