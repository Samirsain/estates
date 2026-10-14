// The demo world (spec §2): three Jaipur Projects, their plots and PLC rules,
// and the cast. Pure data — the toolkit turns it into records.

export const MOBILE_PREFIX = "93";
export const REF_PREFIXES = ["UTR26", "NEFT26", "RFD26"];
export const PROJECT_CODES = ["SRE", "AH", "MBP", "RSL"];

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
  type: "RESIDENTIAL" | "COMMERCIAL";
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

export const PROJECTS: Record<"SRE" | "AH" | "MBP", ProjectSpec> = {
  SRE: {
    code: "SRE",
    name: "Shri Ram Enclave",
    city: "Jaipur",
    location: "Jagatpura, Jaipur, Rajasthan",
    type: "RESIDENTIAL",
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
    plc: [{ category: "ROAD_WIDTH", threshold: "80.00", percent: "5.0000" }],
    plots: businessParkPlots(),
  },
};

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
