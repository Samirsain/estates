// The all-cases world: one Project where every rule of the CRM is exercised on
// its own Plot, and the cast that does it. Pure data, like world.ts; the story
// in all-cases.ts turns it into records through the services.

import type { CastSpec, PlotRow, ProjectSpec } from "./world.ts";

/** Kept apart from the demo (93…) so neither dataset's wipe touches the other. */
export const AC_MOBILE_PREFIX = "94000";
export const AC_PROJECT_CODES = ["ALLC", "ALLR"];
/** Payment and Recovery references of this dataset; the demo uses UTR26 / NEFT26 / RFD26. */
export const AC_REF_PREFIXES = ["TUTR", "TNEFT", "TRFD", "TREC"];
/** Land Inquiries are not tied to a Project, so they carry their own request prefix. */
export const AC_LAND_PREFIX = "ALLCASE-";

const pad = (n: number) => String(n).padStart(2, "0");
let mobile = 0;
const m = () => `${AC_MOBILE_PREFIX}${String(++mobile).padStart(5, "0")}`;

/**
 * TN-01…TN-80 residential (01–20 are 30×50, 21–50 30×60, 51–80 40×60; 61–70
 * face the park, so a Change Plot can move to a cheaper unit), TN-C01…TN-C14
 * commercial shops.
 */
function plots(): PlotRow[] {
  const homes = Array.from({ length: 80 }, (_, i) => {
    const n = i + 1;
    const [w, l] = n <= 20 ? ["30", "50"] : n <= 50 ? ["30", "60"] : ["40", "60"];
    return {
      plotNumber: `TN-${pad(n)}`,
      plotType: "RESIDENTIAL" as const,
      widthFt: w,
      lengthFt: l,
      boundaries: [
        { side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: n <= 10 ? "60" : "30" },
        { side: "SOUTH" as const, kind: n >= 61 && n <= 70 ? ("PARK" as const) : ("PLOT" as const) },
        { side: "EAST" as const, kind: "PLOT" as const },
        { side: "WEST" as const, kind: "PLOT" as const },
      ],
    };
  });
  const shops = Array.from({ length: 14 }, (_, i) => ({
    plotNumber: `TN-C${pad(i + 1)}`,
    plotType: "COMMERCIAL" as const,
    widthFt: "20",
    lengthFt: "40",
    boundaries: [
      { side: "NORTH" as const, kind: "ROAD" as const, roadWidthFt: "60" },
      { side: "SOUTH" as const, kind: "PLOT" as const },
      { side: "EAST" as const, kind: "PLOT" as const },
      { side: "WEST" as const, kind: "PLOT" as const },
    ],
  }));
  return [...homes, ...shops];
}

export const AC_PROJECT: ProjectSpec = {
  code: "ALLC",
  name: "Test Nagar (All Cases)",
  city: "Jaipur",
  location: "Sitapura, Jaipur, Rajasthan",
  type: "RESIDENTIAL",
  developer: "Test Nagar Developers Pvt. Ltd.",
  reraNumber: "RAJ/P/2026/5001",
  amenities: ["Clubhouse", "Swimming pool", "Park", "Gym", "Security", "Parking"],
  plc: [
    { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
    { category: "PARK_FACING", threshold: null, percent: "2.0000" },
  ],
  plots: plots(),
};

/** Prakash Goyal owes a Recovery; Rajat Malpani shares his mobile and address. */
const GOYAL = { mobile: "9400099901", address: "12, Durgapura" };

/**
 * The one Member whose profile shows everything is TM01, Vijay Rathore. The
 * others are only there because his story needs them: his inviters, his
 * invitees, a Member whose sale is corrected to him, and the Recovery holder.
 */
export const AC_MEMBERS: Record<string, CastSpec & { inviter: string | null; reraExpiry?: string }> = {
  TM02: { name: "Sunil Bhati", inviter: null, kyc: "verified", mobile: m() },
  TM03: { name: "Anita Choudhary", inviter: null, kyc: "verified", mobile: m() },
  // Activated under Anita Choudhary by mistake; MD corrects the inviter to Sunil Bhati.
  TM01: { name: "Vijay Rathore", inviter: "TM03", kyc: "verified", reraExpiry: "2026-05-31", mobile: m() },
  TM04: { name: "Rohit Jain", inviter: "TM01", kyc: "verified", mobile: m() },
  TM05: { name: "Kavita Rao", inviter: "TM01", kyc: "verified", mobile: m() },
  TM06: { name: "Mohan Lal Saini", inviter: null, kyc: "verified", mobile: m() },
  TM07: { name: "Prakash Goyal", inviter: null, kyc: "verified", ...GOYAL },
};

const NAMES = [
  "Aarav Mehra", "Bhavesh Kothari", "Chetan Purohit", "Disha Rawat", "Ekta Bansal", "Farhan Qureshi", "Gaurav Saxena",
  "Harshita Singhal", "Imran Khan", "Jyoti Kanwar", "Karan Malhotra", "Lata Choudhary", "Manish Tak", "Neelam Soni",
  "Om Prakash Jat", "Pallavi Mittal", "Quresh Ali", "Ritu Bhargava", "Sachin Gehlot", "Tanvi Agarwal", "Uday Shekhawat",
  "Vandana Sethi", "Wasim Akram", "Yash Vardhan", "Zoya Mirza", "Abhishek Tiwari", "Bindu Rathi", "Chirag Lodha",
  "Divya Kalra", "Eshan Bhatt", "Falguni Desai", "Girish Pandey", "Heena Dadhich", "Ishwar Lal", "Jaya Mishra",
  "Kailash Meghwal", "Lokesh Bairwa", "Madhu Sharma", "Nitin Kalwani", "Ojas Chauhan", "Pooja Taneja", "Rahul Sankhla",
  "Sarita Khandelwal", "Tarun Jain", "Usha Gupta", "Vikram Singh", "Yamini Joshi", "Ajit Dhaka", "Babita Rani",
  "Chandan Verma", "Deepak Tanwar", "Esha Goenka", "Fateh Singh", "Garima Vyas", "Hitesh Nagar", "Indu Bala",
  "Jagdish Prasad", "Kirti Paliwal", "Laxmi Narayan", "Mukul Arora", "Nisha Rathore", "Omkar Saini", "Pinky Kumari",
  "Rakesh Dhariwal", "Sangeeta Rao", "Tejas Agrawal", "Uma Shankar", "Vinod Kumar", "Yogita Sharma", "Alok Ranjan",
];

/**
 * Buyers C01…C70, plus named Customers whose KYC is part of their case.
 * A buyer is a Customer the moment their first Hold or Booking Request is made.
 */
export const AC_CUSTOMERS: Record<string, CastSpec> = {
  ...Object.fromEntries(NAMES.map((name, i) => [`C${pad(i + 1)}`, { name, kyc: "verified" as const, mobile: m() }])),
  // The one Customer whose profile shows everything.
  HC: { name: "Rajat Malpani", kyc: "verified", ...GOYAL },
  // Joint buyer on his first Plot; her account is the joint one he later enters.
  spouse: { name: "Neha Malpani", kyc: "verified", mobile: m() },
  dup: { name: "Rajat Kumar Malpani", kyc: "available", mobile: m() },
  // People Vijay's portal Hold Requests and enquiries are for.
  e1: { name: "Neeraj Bohra", kyc: "none", mobile: m() },
  e2: { name: "Payal Lunia", kyc: "none", mobile: m() },
  e6: { name: "Sonal Daga", kyc: "none", mobile: m() },
  e7: { name: "Vivek Purohit", kyc: "none", mobile: m() },
  h7: { name: "Bela Jain", kyc: "none", mobile: m() },
  h8: { name: "Chetna Goyal", kyc: "none", mobile: m() },
};
