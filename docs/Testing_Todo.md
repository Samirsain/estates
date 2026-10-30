# Testing Todo — naya mock data (30 Oct 2026)

Purana saara data hata diya gaya hai. Sirf staff logins bache hain. Naya data `npm run seed:fresh` se bana hai. Kaun kya hai, poori list `docs/Mock_Data_Guide.md` me hai.

MD (STF-0001) se sign in karo. Har line test karke tick karo.

## 1. Projects aur card

- [ ] **Projects** me sirf 4 Projects hon: Kishangarh Farm Estates, Vaishali Residency Phase 2, Malviya Nagar Plaza, Shree Balaji Royal Greens Township Phase 1 Extension.
- [ ] **Kishangarh Farm Estates** kholo. Ek line me: naam, Active badge, code KFE, Agricultural pill, "By Kishangarh Agro Developers LLP", aur bilkul right me RERA RAJ/P/2026/4127. Naam ke neeche address chhote text me.
- [ ] Uske neeche patli line, chhota "Amenities" label, aur 6 amenities 3 columns me.
- [ ] **Vaishali Residency Phase 2**: Unreleased badge, RERA "—", Amenities aur links nahi.
- [ ] **Malviya Nagar Plaza**: Sold Out badge, "By" wali line nahi.
- [ ] **Shree Balaji Royal Greens…**: Completed badge, lamba naam/address theek se wrap, 12 amenities, teeno link pills.
- [ ] Phone size (F12 → phone icon, 375 px): line tootkar neeche aaye, page side me scroll na ho.
- [ ] **Projects list → More info**: wahi block, "Project Amenities" heading, Download PDF chale.

## 2. Plots aur Bookings (Kishangarh, KF-01…KF-10, KF-C1, KF-C2)

- [ ] **Plot Inventory**: KF-03 (Hold), KF-04 (Waiting for Booking Approval), KF-08, KF-C1, KF-C2 (Available) aur KF-10 (Not Available, Not for Sale). Booked / Payment Completed / Delivered Plots yahan nahi.
- [ ] **Bookings** list: KF-02, KF-05, KF-06, KF-09 (Payment Completed) ke aage **Delivered** button. KF-07 (Booked) pe Payment, KF-04 aur KF-01 pe "—".
- [ ] Kisi Payment Completed row pe **Delivered** dabao: Deliver form khule (final buyer + route). Save karke dekho ki Booking aur Plot Delivered ho jaayein.
- [ ] **KF-01 ka Plot page aur Booking page (hero)**: puri kahani History me — Enquiry, follow-up, Hold, Hold extension, Booking Request corrected (version 2), approved, 30% (payer: Ramesh Chand Sharma, father), cancellation refused, 35% + 35%, final buyers with PAN, Registry → Delivered. Joint buyers Deepika + Amit 50/50.

## 3. Members (5)

- [ ] **Hemant Kumar Saini (MEM-000001) — hero**: nickname "Saini ji", alternate mobile, email, DOB, address, Aadhaar Verified, bank, RERA Registered. Network: Kiran aur Sonal. KF-01 aur KF-06 ka Direct **Paid**. Rewards me Kishangarh Reward **Earned**. Royalty Points: 15 kamaye (Deepika ki KF-09), 6 Voucher + 4 Gift me kharch, 5 bache. (PAN khaali hai — Member ka PAN koi screen nahi leti.)
- [ ] **Kiran Rathore (MEM-000002)**: inviter Hemant, RERA Pending → KF-02 ka Direct **On Hold (RERA Pending)**.
- [ ] **Mahendra Singh Tanwar (MEM-000003)**: RERA 12 Nov ko expire; reminder task 5 Nov se aayega. KF-04 ki Booking Request waiting (Task List: "Verify — Booking Payment").
- [ ] **Sonal Agarwal (MEM-000004)**: inviter Hemant, RERA Not Applicable (reason ke saath), koi sale nahi.
- [ ] **Ravi Prakash Meena (MEM-000005)**: bank nahi, Aadhaar verified nahi → KF-07 ka Direct **On Hold**.

## 4. Customers (8)

- [ ] **Deepika Sharma (CUS-000001) — hero**: nickname, alternate mobile, email, DOB, address, Aadhaar Verified, PAN, bank. Royalty Linked to Hemant (final). Bookings: KF-01 (Delivered, joint) aur KF-09 (repeat purchase, Club se, 100%). Loyalty: KF-09 repeat-purchase aur KF-05 closer (Sunita) — dono **Paid**.
- [ ] **Amit Sharma (CUS-000002)**: KF-01 ka joint buyer 50%, PAN on file.
- [ ] **Manoj Kumawat (CUS-000003)**: KF-02, Payment Completed.
- [ ] **Naveen Khandelwal (CUS-000004)**: KF-06, Payment Completed.
- [ ] **Sunita Choudhary (CUS-000005)**: KF-05, Sold By Customer Deepika, Payment Completed.
- [ ] **Ritu Saxena (CUS-000006)**: KF-07, 30% paid, Aadhaar verified nahi.
- [ ] **Arvind Jangid (CUS-000007)**: KF-04, Booking Request Accounts ke paas.
- [ ] **Pooja Verma (CUS-000008)**: KF-03 pe Hold; Customer ID Hold se bani.

## 5. Investor Leads (5)

- [ ] **Investor Leads** me 5 log: Rajesh Agrawal aur Anjali Mathur ke alternate mobile hain, Suresh Bhatia ki city khaali hai.

## 6. Land Inquiries

- [ ] **Land Inquiries** list khaali ho.
- [ ] **New Land Inquiry** se ek inquiry bana ke kholo. Sirf form wale 7 box hon. Desktop pe teen column: 1·4·7 | 2·5 | 3·6. Har box apni height ka ho, koi card khaali na dikhe.

## 7. Public Portal

- [ ] Top bar → **Public Portal ▾ → Open Link**. List me sirf Kishangarh Farm Estates aur Malviya Nagar Plaza hon. Vaishali (Unreleased) aur Shree Balaji (portal off) nahi dikhne chahiye.
- [ ] Kishangarh ke public page pe: 1 Available, 1 Hold, baaki Sold / Booked. Search Plot, filter aur Download PDF chalao.

## 8. Naye rules: ye cheezein kahin nahi honi chahiye

- [ ] Customer profile pe Customer Terms wali row ya "Record acceptance".
- [ ] Member page pe portal login, Unlock / Reset / invite link. `/portal` kholo to page na mile.
- [ ] Sidebar me Rewards, Task List ya Calculator (ye top bar me hain).
- [ ] Customer ya Booking form me Customer Type.
