-- Development Potential now offers Industrial and Farmhouse as checkboxes on
-- the Land Inquiry form. OTHER stays in the enum for inquiries already saved.
ALTER TYPE "LandDevelopmentPotential" ADD VALUE 'INDUSTRIAL';
ALTER TYPE "LandDevelopmentPotential" ADD VALUE 'FARMHOUSE';
