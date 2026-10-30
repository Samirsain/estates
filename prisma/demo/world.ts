// The demo world (spec §2): four selling Projects, their plots and PLC rules,
// and the cast. Pure data — the toolkit turns it into records.

export const MOBILE_PREFIX = "93";
export const REF_PREFIXES = ["UTR26", "NEFT26", "RFD26"];
export const PROJECT_CODES = ["SRE", "AH", "MBP", "RSL", "KFE", "VR2", "MNP", "SBG"];

type Side = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type PlotRow = {
  plotNumber: string;
  plotType: "RESIDENTIAL" | "COMMERCIAL";
  widthFt: string;
  lengthFt: string;
  boundaries: { side: Side; kind: "ROAD" | "PLOT" | "PARK"; roadWidthFt?: string }[];
};
export type ProjectSpec = {
  code: string;
  name: string;
  city: string;
  location: string;
  type: "RESIDENTIAL" | "COMMERCIAL" | "AGRICULTURAL";
  /** What the Project card shows (owner's card prompt, 30 Oct 2026). */
  developer?: string;
  reraNumber?: string;
  amenities?: string[];
  locationUrl?: string;
  driveUrl?: string;
  renderUrl?: string;
  plc: { category: "ROAD_WIDTH" | "OPEN_SIDES" | "PARK_FACING"; threshold: string | null; percent: string }[];
  plots: PlotRow[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const road = (side: Side, ft: string) => ({ side, kind: "ROAD" as const, roadWidthFt: ft });
const plot = (side: Side) => ({ side, kind: "PLOT" as const });
const park = (side: Side) => ({ side, kind: "PARK" as const });

/** SR-01…SR-30: 01–10 on the 60 ft main road, 11–15 face the park, row ends are corners. */
function shriRamPlots(): PlotRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const n = i + 1;
    const corner = [1, 10, 11, 20, 21, 30].includes(n);
    const [w, l] = n <= 10 ? ["30", "50"] : n <= 20 ? ["30", "60"] : ["40", "60"];
    return {
      plotNumber: `SR-${pad(n)}`,
      plotType: "RESIDENTIAL" as const,
      widthFt: w,
      lengthFt: l,
      boundaries: [
        road("NORTH", n <= 10 ? "60" : n <= 20 ? "30" : "40"),
        n >= 11 && n <= 15 ? park("SOUTH") : plot("SOUTH"),
        corner ? road("EAST", "30") : plot("EAST"),
        plot("WEST"),
      ],
    };
  });
}

/** AH-01…AH-20 residential, AH-V1…AH-V5 villa plots on the park. */
function aravaliPlots(): PlotRow[] {
  const homes = Array.from({ length: 20 }, (_, i) => ({
    plotNumber: `AH-${pad(i + 1)}`,
    plotType: "RESIDENTIAL" as const,
    widthFt: i < 10 ? "30" : "35",
    lengthFt: "60",
    boundaries: [road("NORTH", i < 5 ? "60" : "40"), plot("SOUTH"), plot("EAST"), plot("WEST")],
  }));
  const villas = Array.from({ length: 5 }, (_, i) => ({
    plotNumber: `AH-V${i + 1}`,
    plotType: "RESIDENTIAL" as const,
    widthFt: "50",
    lengthFt: "80",
    boundaries: [road("NORTH", "60"), park("SOUTH"), plot("EAST"), plot("WEST")],
  }));
  return [...homes, ...villas];
}

/** MB-S01…MB-S20 shops; 01–10 front the 80 ft Mansarovar main road. */
function businessParkPlots(): PlotRow[] {
  return Array.from({ length: 20 }, (_, i) => ({
    plotNumber: `MB-S${pad(i + 1)}`,
    plotType: "COMMERCIAL" as const,
    widthFt: "20",
    lengthFt: "40",
    boundaries: [road("NORTH", i < 10 ? "80" : "40"), plot("SOUTH"), plot("EAST"), plot("WEST")],
  }));
}

export const PROJECTS: Record<string, ProjectSpec> = {
  SRE: {
    code: "SRE",
    name: "Shri Ram Enclave",
    city: "Jaipur",
    location: "Jagatpura, Jaipur, Rajasthan",
    type: "RESIDENTIAL",
    developer: "Shri Ram Buildcon Pvt. Ltd.",
    reraNumber: "RAJ/P/2026/2104",
    amenities: ["Clubhouse", "Swimming pool", "Central park", "Gym", "24x7 security", "Covered parking", "Children's play area", "JDA approved layout"],
    locationUrl: "https://maps.google.com/?q=Jagatpura,+Jaipur",
    driveUrl: "https://drive.google.com/drive/folders/shri-ram-enclave-layout",
    renderUrl: "https://www.youtube.com/watch?v=shri-ram-enclave-3d",
    plc: [
      { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
      { category: "PARK_FACING", threshold: null, percent: "2.0000" },
      { category: "OPEN_SIDES", threshold: "2.00", percent: "2.5000" },
    ],
    plots: shriRamPlots(),
  },
  AH: {
    code: "AH",
    name: "Aravali Heights",
    city: "Jaipur",
    location: "Ajmer Road, Jaipur, Rajasthan",
    type: "RESIDENTIAL",
    developer: "Aravali Infra Developers LLP",
    reraNumber: "RAJ/P/2026/2689",
    amenities: ["Villa plots on the park", "Jogging track", "Clubhouse", "Yoga lawn", "Gated entry", "Underground cabling", "Rainwater harvesting"],
    locationUrl: "https://maps.google.com/?q=Ajmer+Road,+Jaipur",
    driveUrl: "https://drive.google.com/drive/folders/aravali-heights-layout",
    plc: [
      { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
      { category: "PARK_FACING", threshold: null, percent: "3.0000" },
    ],
    plots: aravaliPlots(),
  },
  MBP: {
    code: "MBP",
    name: "Mansarovar Business Park",
    city: "Jaipur",
    location: "Mansarovar, Jaipur, Rajasthan",
    type: "COMMERCIAL",
    developer: "Mansarovar Realty Group",
    reraNumber: "RAJ/P/2026/3051",
    amenities: ["80 ft main road frontage", "Visitor parking", "Power backup", "Lift-ready shops", "CCTV security"],
    locationUrl: "https://maps.google.com/?q=Mansarovar,+Jaipur",
    plc: [{ category: "ROAD_WIDTH", threshold: "80.00", percent: "5.0000" }],
    plots: businessParkPlots(),
  },
  KFE: {
    code: "KFE",
    name: "Kishangarh Farm Estates",
    city: "Kishangarh",
    location: "Ajmer Highway, Kishangarh, Rajasthan",
    type: "AGRICULTURAL",
    developer: "Kishangarh Agro Developers LLP",
    reraNumber: "RAJ/P/2026/4127",
    amenities: ["Farmhouse-ready plots", "Drip irrigation line", "Borewell water", "Boundary fencing", "Fruit tree plantation", "Gated entry"],
    locationUrl: "https://maps.google.com/?q=Kishangarh,+Ajmer+Highway",
    driveUrl: "https://drive.google.com/drive/folders/kishangarh-farm-estates-layout",
    renderUrl: "https://www.youtube.com/watch?v=kishangarh-farm-estates-3d",
    // Every PLC category, with bands, so the Plots reach each one.
    plc: [
      { category: "ROAD_WIDTH", threshold: "30.00", percent: "1.0000" },
      { category: "ROAD_WIDTH", threshold: "40.00", percent: "2.0000" },
      { category: "ROAD_WIDTH", threshold: "60.00", percent: "3.0000" },
      { category: "OPEN_SIDES", threshold: "2.00", percent: "2.0000" },
      { category: "OPEN_SIDES", threshold: "3.00", percent: "3.0000" },
      { category: "PARK_FACING", threshold: null, percent: "2.0000" },
    ],
    plots: farmPlots(),
  },
};

/**
 * Projects that exist only to show every way a Project card can read (owner's
 * card prompt, 30 Oct 2026): each status, no RERA, no developer, no
 * amenities, a long name, and one taken off the Public Portal. No Plots.
 */
export const CARD_PROJECTS = [
  {
    code: "VR2",
    name: "Vaishali Residency Phase 2",
    type: "RESIDENTIAL" as const,
    status: "SETUP_NOT_ACTIVE" as const,
    developer: "Vaishali Homes Pvt. Ltd.",
    location: "Vaishali Nagar, Jaipur, Rajasthan",
    city: "Jaipur",
    publicPortal: true,
  },
  {
    code: "MNP",
    name: "Malviya Nagar Plaza",
    type: "COMMERCIAL" as const,
    status: "SOLD_OUT" as const,
    reraNumber: "RAJ/P/2025/1876",
    location: "Malviya Nagar, Jaipur, Rajasthan",
    city: "Jaipur",
    amenities: ["Basement parking", "Lifts", "Fire safety", "Food court"],
    publicPortal: true,
  },
  {
    code: "SBG",
    name: "Shree Balaji Royal Greens Township Phase 1 Extension",
    type: "RESIDENTIAL" as const,
    status: "COMPLETED" as const,
    developer: "Shree Balaji Landmark Developers and Promoters Pvt. Ltd.",
    reraNumber: "RAJ/P/2024/0932",
    location: "Near Mahindra SEZ, Kalwara Road, off Ajmer Road, Jaipur, Rajasthan 302026",
    city: "Jaipur",
    amenities: [
      "Clubhouse",
      "Swimming pool",
      "Gym",
      "Central park",
      "Jogging track",
      "Children's play area",
      "Temple",
      "Community hall",
      "24x7 security",
      "CCTV surveillance",
      "Covered parking",
      "Power backup",
    ],
    locationUrl: "https://maps.google.com/?q=Kalwara+Road,+Jaipur",
    driveUrl: "https://drive.google.com/drive/folders/shree-balaji-royal-greens-layout",
    renderUrl: "https://www.youtube.com/watch?v=shree-balaji-royal-greens-3d",
    publicPortal: false,
  },
];

/**
 * KF-01…KF-10 farmhouse plots and KF-C1, KF-C2 shops at the gate. KF-01 is the
 * corner on the 60 ft highway road facing the orchard park (three open sides);
 * 06–08 face the park; 09–10 sit on the 30 ft lane.
 */
function farmPlots(): PlotRow[] {
  const farm = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return {
      plotNumber: `KF-${pad(n)}`,
      plotType: "RESIDENTIAL" as const,
      widthFt: "100",
      lengthFt: n <= 4 ? "200" : "250",
      boundaries:
        n === 1
          ? [road("NORTH", "60"), road("EAST", "40"), park("SOUTH"), plot("WEST")]
          : [road("NORTH", n >= 9 ? "30" : "40"), n >= 6 && n <= 8 ? park("SOUTH") : plot("SOUTH"), plot("EAST"), plot("WEST")],
    };
  });
  const shops = [1, 2].map((n) => ({
    plotNumber: `KF-C${n}`,
    plotType: "COMMERCIAL" as const,
    widthFt: "30",
    lengthFt: "50",
    boundaries: [road("NORTH", "60"), n === 1 ? road("EAST", "40") : plot("EAST"), plot("SOUTH"), plot("WEST")],
  }));
  return [...farm, ...shops];
}

export type CastSpec = { name: string; kyc?: "none" | "available" | "verified"; bank?: boolean; address?: string; mobile?: string };

/** Nitin Goyal's number and address — Kamal Goyal shares both (the Check Recovery Link case). */
const GOYAL = { mobile: "9311000009", address: "45, Vaishali Nagar" };

export const MEMBERS: Record<string, CastSpec & { inviter: string | null; reraExpiry?: string }> = {
  M01: { name: "Rajendra Singh Shekhawat", inviter: null, kyc: "verified" },
  M02: { name: "Anita Choudhary", inviter: "M01", kyc: "verified" },
  M03: { name: "Mukesh Jain", inviter: "M01", kyc: "verified" },
  M04: { name: "Pooja Khandelwal", inviter: null, kyc: "verified" },
  M05: { name: "Sandeep Meena", inviter: "M04", kyc: "verified" },
  M06: { name: "Kavita Rathore", inviter: "M02", kyc: "verified" },
  M07: { name: "Harish Agarwal", inviter: null, kyc: "verified" },
  M08: { name: "Deepak Saini", inviter: "M03", kyc: "verified", reraExpiry: "2026-10-19" },
  M09: { name: "Nitin Goyal", inviter: null, kyc: "verified", ...GOYAL },
  M10: { name: "Ramesh Kumawat", inviter: "M01", kyc: "verified" },
  M11: { name: "Sunita Bairwa", inviter: "M04", kyc: "verified" },
  M12: { name: "Ajay Sharma", inviter: null, kyc: "verified" },
  M13: { name: "Lokesh Yadav", inviter: "M12", kyc: "verified", bank: false },
  M14: { name: "Priya Mathur", inviter: "M12", kyc: "none" },
};

export const CUSTOMERS: Record<string, CastSpec> = {
  vikas: { name: "Vikas Bansal", kyc: "verified", address: "8, Tilak Nagar" },
  neha: { name: "Neha Joshi", kyc: "verified", address: "102, Shyam Nagar" },
  ashok: { name: "Ashok Gupta", kyc: "verified", address: "23, Raja Park" },
  manoj: { name: "Manoj Saxena", kyc: "verified" },
  rakesh: { name: "Rakesh Saxena", kyc: "verified" },
  suresh: { name: "Suresh Agarwal", kyc: "verified", address: "17, C-Scheme" },
  meena: { name: "Meena Agarwal", kyc: "verified", address: "17, C-Scheme", bank: false },
  rohit: { name: "Rohit Verma", kyc: "verified" },
  rohitAgain: { name: "Rohit Kumar Verma", kyc: "available" },
  dinesh: { name: "Dinesh Choudhary", kyc: "verified" },
  kamla: { name: "Kamla Devi Sharma", kyc: "verified" },
  gaurav: { name: "Gaurav Khanna", kyc: "available" },
  anjali: { name: "Anjali Mehta", kyc: "verified" },
  pradeep: { name: "Pradeep Kumawat", kyc: "verified" },
  yogesh: { name: "Yogesh Tiwari", kyc: "verified" },
  shalini: { name: "Shalini Arora", kyc: "verified" },
  bhavna: { name: "Bhavna Kothari", kyc: "verified" },
  arvind: { name: "Arvind Malhotra", kyc: "verified" },
  sunil: { name: "Sunil Jangid", kyc: "verified" },
  kamal: { name: "Kamal Goyal", kyc: "verified", ...GOYAL },
  lalit: { name: "Lalit Sharma", kyc: "verified" },
  seema: { name: "Seema Rathore", kyc: "verified" },
  hemant: { name: "Hemant Joshi", kyc: "verified" },
  nikhil: { name: "Nikhil Agarwal", kyc: "verified" },
  rajiv: { name: "Rajiv Malhotra", kyc: "verified" },
  sapna: { name: "Sapna Jain", kyc: "verified" },
  deepa: { name: "Deepa Soni", kyc: "verified" },
  tarun: { name: "Tarun Mathur", kyc: "verified" },
  vandana: { name: "Vandana Singh", kyc: "verified" },
  mohit: { name: "Mohit Bhatia", kyc: "available" },
  harsh: { name: "Harsh Vardhan Singh", kyc: "verified" },
  ritika: { name: "Ritika Chandna", kyc: "verified" },
  anil: { name: "Anil Kapoor", kyc: "verified" },
  rekha: { name: "Rekha Joshi", kyc: "available" },
  sanjay: { name: "Sanjay Khatri", kyc: "available" },
  payal: { name: "Payal Dixit", kyc: "available" },
  kirti: { name: "Kirti Sharma", kyc: "none" },
  sneha: { name: "Sneha Agrawal", kyc: "none" },
  irfan: { name: "Mohammed Irfan", kyc: "none" },
  pallavi: { name: "Pallavi Joshi", kyc: "none" },
  rakeshMeena: { name: "Rakesh Meena", kyc: "none" },
  gopal: { name: "Gopal Krishna Bhatt", kyc: "none" },
  ishaan: { name: "Ishaan Bhargava", kyc: "none" },
  poojaRawat: { name: "Pooja Rawat", kyc: "none" },
  vivek: { name: "Vivek Sood", kyc: "none" },
  aman: { name: "Aman Kalra", kyc: "none" },
  kiranPal: { name: "Kiran Pal", kyc: "none" },
  sumit: { name: "Sumit Rana", kyc: "none" },
  naveen: { name: "Naveen Bhati", kyc: "none" },
  mahendra: { name: "Mahendra Rawat", kyc: "verified" },
};
