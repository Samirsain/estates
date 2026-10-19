/**
 * The ready-made remarks and reasons each box offers, as the remark presets
 * list gives them. Staff pick one, or pick "Other" and type the rare case.
 * Approve / Reject boxes keep both kinds in one list; `RemarkSelect` shows
 * only the "Approved — …" or "Rejected — …" half that matches the decision.
 */
export const REMARK_PRESETS = {
  // Plots and Holds
  makeAvailable: [
    "Plot is ready to sell",
    "Pledge released by the Nagarpalika",
    "Legal / title issue cleared",
  ],
  plotRestriction: [
    "Pledged to the Nagarpalika",
    "Not for sale",
    "Plot is ready to sell",
    "Issue on the Plot",
  ],
  cancelHold: [
    "Customer is no longer interested",
    "Payment not received in time",
    "Customer not reachable",
    "Hold placed by mistake",
  ],
  holdExtension: [
    "Customer is arranging the booking amount",
    "Customer wants a site visit first",
    "Waiting for bank loan approval",
    "Customer is asking for discount",
  ],
  decideHoldExtension: [
    "Approved — genuine reason given",
    "Approved — last extension, no more after this",
    "Rejected — another buyer is waiting for this Plot",
    "Rejected — too many extensions already",
    "Rejected — no confirmation from the customer",
  ],
  decideHoldRequest: [
    "Approved — Buyer details checked",
    "Approved — Plot is Available and Member is active",
    "Rejected — Plot is already held for another buyer",
    "Rejected — buyer details incomplete",
    "Rejected — duplicate request",
  ],
  editPlot: [
    "Correction after site measurement",
    "Size changed as per the approved map",
    "Plot type corrected",
    "Facing / corner details corrected",
    "Typing mistake in the earlier entry",
  ],
  plotAreaReason: [
    "As per the site survey",
    "Irregular shape — exact area measured",
    "As per the approved layout plan",
    "Area adjusted for road widening",
  ],

  // Enquiries
  newEnquiry: [
    "Walk-in at the site",
    "Call from an advertisement",
    "Asked for the price list and brochure",
    "Looking for a specific size or facing",
  ],
  followUp: [
    "Will visit the site this weekend",
    "Price list and brochure sent on WhatsApp",
    "Will discuss with family and call back",
    "Budget is lower than our price",
    "Ready to book, waiting for the token amount",
  ],
  closeEnquiry: [
    "Booked a Plot with us",
    "Bought somewhere else",
    "Budget does not match",
    "Not reachable after many tries",
    "Duplicate or wrong enquiry",
  ],
  portalEnquiry: [
    "Customer wants a site visit",
    "Customer is ready to book soon",
    "Customer wants a corner Plot",
  ],

  // Bookings
  backdatedBooking: [
    "Booking amount received earlier, entry made late",
    "Customer paid by cheque on that date",
    "Office closed (holiday) on that date",
  ],
  resendBooking: [
    "Payment schedule corrected as Accounts asked",
    "Customer details completed",
    "Wrong Plot selected earlier",
    "Sold By corrected",
    "Payment proof added",
  ],
  verifyBooking: [
    "Approved — payment checked in the bank statement",
    "Approved — details and schedule are correct",
    "Approved — 0% received, payment expected as per schedule",
    "Rejected — schedule does not match the agreement",
    "Rejected — customer documents missing",
  ],
  cancelBooking: [
    "Customer changed plans",
    "Family emergency or money problem",
    "Customer bought somewhere else",
    "Booked by mistake or duplicate Booking",
  ],
  decideCancellation: [
    "Approved — refund as per the agreement",
    "Approved — cancellation letter received from the customer",
    "Approved — no refund due as per the terms",
    "Rejected — customer withdrew the cancellation",
    "Rejected — cancellation letter not received",
  ],
  changePrimary: [
    "Booking transferred to a family member",
    "Name corrected to the actual buyer",
    "Joint buyer becomes the main buyer",
  ],
  decidePrimary: [
    "Approved — documents checked",
    "Approved — request from both customers received",
    "Rejected — documents incomplete",
    "Rejected — the old customer has not agreed",
  ],
  changeShares: [
    "Shares changed as per the agreement",
    "New joint buyer added",
    "Share split corrected (typing mistake)",
    "Family settlement between the buyers",
  ],
  soldByCorrection: [
    "Wrong Member selected earlier",
    "Sale was by 3% Club, not a Member",
    "Sale was closed by a Customer",
    "Two Members claimed the sale; MD decided",
  ],
  decideSoldBy: [
    "Approved — proof checked",
    "Approved — both Members agree",
    "Approved — customer confirmed who sold",
    "Rejected — not enough proof",
    "Rejected — the original Sold By is correct",
  ],
  changePlot: [
    "Customer wants a bigger Plot",
    "Customer wants a corner or park-facing Plot",
    "Customer wants a smaller Plot because of budget",
    "Customer wants a better location in the Project",
  ],
  decideChangePlot: [
    "Approved — new Plot is Available and the price is checked",
    "Approved — price difference agreed with the customer",
    "Rejected — new Plot is not available",
    "Rejected — price difference not settled",
  ],
  reopenDelivered: [
    "Registry details need correction",
    "Allotment letter issued with a mistake",
    "Delivery was entered by mistake",
    "Customer details missing on the papers",
  ],
  paymentReceived: [
    "Received by bank transfer (NEFT / RTGS)",
    "Received by cheque, cleared",
    "Received by UPI",
    "Home loan amount released by the bank",
    "Part payment, balance as per schedule",
  ],
  correctPayment: [
    "Wrong amount entered",
    "Cheque bounced",
    "Entered against the wrong Booking",
    "Duplicate entry of the same payment",
  ],
  reviseSchedule: [
    "Customer asked for more time",
    "Bank loan disbursement delayed",
    "Instalments rearranged as agreed with the customer",
    "Dates corrected as per the agreement",
  ],
  decideSchedule: [
    "Approved — matches the customer's written request",
    "Approved — management approval",
    "Rejected — delay is too long",
    "Rejected — earlier dues still not paid",
  ],

  // Buyback / Resale
  newDeal: [
    "Customer wants to sell the Plot back to the company",
    "Customer needs money urgently",
    "Customer cannot pay the remaining instalments",
  ],
  paymentGiven: [
    "Paid by bank transfer (NEFT / RTGS)",
    "Paid by cheque",
    "Part payment, balance as per schedule",
    "Final payment",
  ],
  correctPaymentGiven: [
    "Wrong amount entered",
    "Wrong payment date entered",
    "Cheque bounced",
    "Entered against the wrong deal",
    "Duplicate entry of the same payment",
  ],
  decideDeal: [
    "Approved — Advance Payment Given checked",
    "Approved — papers and seller details checked",
    "Rejected — Payment Given not reached",
    "Rejected — seller papers incomplete",
  ],
  cancelDeal: [
    "Seller changed their mind",
    "Price not agreed",
    "Legal issue found on the property",
    "Deal created by mistake",
  ],
  buyingCommissionPaid: [
    "Paid by bank transfer",
    "Paid by cheque",
    "Paid Early — approved by MD",
    "Paid after 100% Payment Given",
  ],

  // Commission, Paid Early and Recovery
  commissionPaid: ["Paid by bank transfer", "Paid by cheque", "Paid Early — approved by MD"],
  requestPaidEarly: [
    "Member asked for an advance",
    "Customer payment confirmed, entry pending",
    "Special approval for a top Member",
  ],
  approvePaidEarly: ["Member has a good record", "Customer payment confirmed"],
  rejectPaidEarly: ["Customer payments are delayed", "Member has an open Recovery"],
  payBeforeRecovery: ["MD decided not to delay this payment", "Recovery amount is small"],
  openRecovery: [
    "Commission paid on a cancelled Booking",
    "Commission paid to the wrong person",
    "Plot changed to a cheaper Plot",
    "Paid Early, but the sale did not complete",
  ],
  closeAdjustment: [
    "Checked",
    "Already adjusted in the next payout",
    "Amount too small to recover",
    "Paid amount is correct for the new Plot",
  ],
  recoveryRepaid: [
    "Repaid by bank transfer",
    "Repaid by cheque",
    "Repaid by UPI",
    "Repaid in parts, last part received",
    "Repaid in cash at the office",
  ],
  recoverySetOff: [
    "Adjusted against the next commission payout",
    "Adjusted against a Loyalty Points payout",
    "Adjusted against a Buying Commission",
    "Part set off, balance to be repaid",
  ],
  recoveryLinkCheck: [
    "Approved — same family address only, not linked to the Recovery",
    "Approved — different person, shared office number",
    "Approved — the Recovery is being repaid",
    "Rejected — same bank account as the person who owes",
    "Rejected — related person, keep on hold until repaid",
  ],

  // Members, Customers, People and Staff
  memberStatus: [
    "Deactivated — Member asked to leave",
    "Deactivated — no sales for a long time",
    "Deactivated — broke company policy",
    "Deactivated — Recovery not paid by the deadline",
    "Reactivated — issue resolved, Member is back",
  ],
  commissionHold: [
    "Hold — KYC, RERA or bank documents pending",
    "Hold — open Recovery against the Member",
    "Removed — documents received",
    "Removed — Recovery settled",
  ],
  reraNotApplicable: [
    "Member only refers buyers, does not sell",
    "Member buys only for self",
    "Not required in the Member's area",
  ],
  bankDetails: ["Verified — bank account checked", "Rejected — account name does not match"],
  editPerson: [
    "Mobile number changed",
    "Name spelling corrected as per Aadhaar",
    "Moved to a new address",
  ],
  portalAccess: [
    "Member forgot the password",
    "Locked after wrong tries, verified by phone",
    "Locked by mistake",
  ],
  disableStaff: [
    "Left the company",
    "On long leave",
    "Replaced by a new account",
    "Security concern",
    "Account created by mistake",
  ],
  resetStaffPassword: [
    "Forgot password, verified by phone",
    "Locked after wrong tries",
    "Security reset",
  ],
  editStaff: ["Mobile number corrected", "Name spelling corrected", "Email changed"],
  changeStaffRole: ["Moved to the Accounts", "Moved to CRM", "Role was set wrongly"],
  changeStaffPermissions: ["Temporary access for an audit", "Access no longer needed"],
  raiseMerge: [
    "Same person entered twice",
    "Same mobile and Aadhaar",
    "Name spelled differently, same person",
    "Old and new mobile of the same person",
  ],
  decideMerge: [
    "Approved — documents show the same person",
    "Approved — confirmed on call",
    "Approved — same Aadhaar",
    "Rejected — different people in the same family",
    "Rejected — not enough proof",
  ],
  reviseTask: [
    "Customer asked to call later",
    "Customer not answering",
    "Waiting for documents from the customer",
    "Waiting for a decision from Accounts or MD",
  ],
  addTask: [
    "Call the customer and confirm",
    "Collect pending documents",
    "Follow up on pending payment",
    "Arrange a site visit",
    "Send papers for signature",
  ],

  // Projects
  editProject: [
    "Updated as per the approved plan",
    "Address or location corrected",
    "New amenity added",
    "Project name spelling corrected",
    "Project RERA number added",
  ],
  locationCharge: ["Corner Plot charge updated", "Park-facing charge updated", "Rates revised by MD"],
  projectStatus: [
    "Project launched for sale",
    "Sales paused by MD",
    "Project sold out",
    "Waiting for approvals",
  ],
  commissionSettings: [
    "New rates for the launch",
    "Rates revised by MD",
    "Offer for a limited time",
    "Trip added / removed",
    "Correction",
  ],
  mdException: ["Launch offer for early buyers", "Limited-time offer", "MD decision for this Project"],

  // Trips and Royalty Tokens
  correctInviter: [
    "Wrong Member ID entered",
    "Member was invited by someone else",
    "No inviter — Member joined directly",
    "Inviter confirmed by both Members",
    "Typing mistake",
  ],
  tripTravelled: [
    "Nominee travelled instead of the Member",
    "Travel date changed by the Member",
    "Trip completed",
  ],
  correctRedemption: [
    "Entered for the wrong Member",
    "Wrong number of points",
    "Entered twice",
    "Gift was not given",
  ],
  recordRedemption: ["Gift item from the catalogue", "Gift voucher"],

  // Land Inquiries
  inquiryStage: [
    "Site visit done, moving ahead",
    "Documents received",
    "Owner shared the papers",
    "Moved back — legal check pending",
    "Rejected — land not suitable",
  ],
  closeInquiry: [
    "Mutation Pending",
    "Bank Mortgage",
    "Court Case / Stay",
    "Family Dispute",
    "Government Restriction",
    "Approach Road Issue",
    "Unreasonable Asking Rate",
    "Master Plan Issue",
  ],
  reopenInquiry: [
    "Owner contacted us again",
    "Price is now acceptable",
    "Legal issue resolved",
    "MD wants to reconsider",
    "Closed by mistake",
  ],
  archiveInquiry: ["Duplicate inquiry", "Entered by mistake", "Merged with another inquiry"],
} as const satisfies Record<string, readonly string[]>;

export type RemarkPresetKey = keyof typeof REMARK_PRESETS;
