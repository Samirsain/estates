-- City Master (owner, 17 Nov 2026): the cities every City field picks from,
-- loaded with the owner's list and its codes exactly as given. The records
-- that already hold a city keep their text; nothing else is touched.
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "City_name_key" ON "City"("name");
CREATE UNIQUE INDEX "City_code_key" ON "City"("code");

-- In the owner's order, so City ID 1 is Suratgarh and 26 is Goluwala.
INSERT INTO "City" ("name", "code", "stateName", "stateCode", "countryName", "countryCode", "updatedAt")
SELECT v.name, v.code, 'Rajasthan', 'RJ', 'India', 'IN', CURRENT_TIMESTAMP
  FROM (VALUES
    (1, 'Suratgarh', 'SOG'),
    (2, 'Ramsinghpur', 'RMSR'),
    (3, 'Raisinghnagar', 'RSNR'),
    (4, 'Srikaranpur', 'SRW'),
    (5, 'Jaitsar', 'JES'),
    (6, 'Srivijaynagar', 'SBNR'),
    (7, 'Anupgarh', 'APH'),
    (8, 'Padampur', 'PDP'),
    (9, 'Khajuwala', 'KWL'),
    (10, 'Lunkaransar', 'LKS'),
    (11, 'Hanumangarh', 'HMH'),
    (12, 'Sangaria', 'SGRA'),
    (13, 'Rawatsar', 'RWT'),
    (14, 'Nohar', 'NHR'),
    (15, 'Bhadra', 'TSD'),
    (16, 'Lalgarh', 'LGH'),
    (17, 'Sadulshahar', 'SDS'),
    (18, 'Kesrisinghpur', 'KSP'),
    (19, 'Gajsinghpur', 'GJS'),
    (20, 'Rajiyasar', 'RJS'),
    (21, 'Gharsana', 'GRSN'),
    (22, 'Rawla', 'RWL'),
    (23, 'Sardarshahar', 'SRDR'),
    (24, 'Tibbi', 'TBI'),
    (25, 'Pilibanga', 'PGK'),
    (26, 'Goluwala', 'GLW')
  ) AS v(ord, name, code)
 ORDER BY v.ord;
