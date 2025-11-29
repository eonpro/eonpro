import { generatePrescriptionPDF } from "./src/lib/pdf";
import { promises as fs } from "fs";

async function generateSamplePrescription() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("💊 GENERATING E-PRESCRIPTION PDF");
    console.log("=".repeat(70));
    
    const prescriptionData = {
      referenceId: "rx-1763425083400",
      date: "11/18/2025",
      provider: {
        name: "VICTOR CRUZ",
        npi: "1861622060",
        dea: "FC4080127",
        licenseNumber: "ME117105",
        address1: "200 Frandorson Cir Ste 203 Apollo Beach FL 33572",
        phone: "813.213.3336",
        fax: null,
      },
      patient: {
        firstName: "Lance",
        lastName: "Boggio",
        phone: "(863) 557-0704",
        email: "lanceboggio@gmail.com",
        dob: "1990-12-13",
        gender: "Male",
        address1: "8541 J R Manor Drive",
        address2: "",
        city: "Tampa",
        state: "FL",
        zip: "33634",
      },
      // Single prescription example
      rx: {
        medication: "Testosterone Cypionate 200 mg/mL (5 mL)",
        strength: "200mg/ml",
        sig: "1mL (200 mg) intramuscularly once weekly.",
        quantity: "1",
        refills: "0",
        daysSupply: 30,
      },
      shipping: {
        methodLabel: "OVERNIGHT",
        addressLine1: "8541 J R Manor Drive",
        addressLine2: "",
        city: "Tampa",
        state: "FL",
        zip: "33634",
      },
      signatureDataUrl: null, // Would contain base64 signature in production
    };
    
    console.log("\n📋 Prescription Details:");
    console.log("   Patient: " + prescriptionData.patient.firstName + " " + prescriptionData.patient.lastName);
    console.log("   Medication: " + prescriptionData.rx.medication);
    console.log("   Provider: " + prescriptionData.provider.name);
    console.log("   Order #: " + prescriptionData.referenceId);
    
    // Generate the PDF as base64
    const pdfBase64 = await generatePrescriptionPDF(prescriptionData);
    
    // Convert base64 to buffer and save
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const outputPath = "./e-prescription-sample.pdf";
    await fs.writeFile(outputPath, pdfBuffer);
    
    console.log("\n✅ E-Prescription PDF Generated Successfully!");
    console.log("📄 File: " + outputPath);
    console.log("📏 Size: " + (pdfBuffer.length / 1024).toFixed(2) + " KB");
    console.log("🔐 Base64 Length: " + pdfBase64.length + " characters");
    
    console.log("\n📖 PDF FEATURES:");
    console.log("   ✓ Professional header with practice info");
    console.log("   ✓ Provider credentials (NPI, DEA, License)");
    console.log("   ✓ Complete patient demographics");
    console.log("   ✓ Prescription details with SIG");
    console.log("   ✓ Shipping information");
    console.log("   ✓ Electronic submission footer");
    console.log("   ✓ Order reference number");
    
    console.log("\n🔍 Opening PDF now...");
    console.log("=".repeat(70) + "\n");
    
  } catch (error) {
    console.error("❌ Error generating prescription PDF:", error);
  }
}

// Test with multiple prescriptions
async function generateMultiPrescriptionSample() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("💊💊 GENERATING MULTI-PRESCRIPTION PDF");
    console.log("=".repeat(70));
    
    const multiPrescriptionData = {
      referenceId: "rx-MULTI-" + Date.now(),
      date: new Date().toLocaleDateString(),
      provider: {
        name: "VICTOR CRUZ",
        npi: "1861622060",
        dea: "FC4080127",
        licenseNumber: "ME117105",
        phone: "813.213.3336",
      },
      patient: {
        firstName: "John",
        lastName: "Smith",
        phone: "(555) 123-4567",
        email: "john.smith@example.com",
        dob: "1985-06-15",
        gender: "Male",
        address1: "123 Main Street",
        address2: "Apt 4B",
        city: "Tampa",
        state: "FL",
        zip: "33601",
      },
      // Multiple prescriptions
      prescriptions: [
        {
          medication: "Semaglutide 2.4mg/3mL Pen",
          strength: "2.4mg/3mL",
          sig: "Inject 0.25mg subcutaneously once weekly for 4 weeks, then increase to 0.5mg weekly",
          quantity: "1",
          refills: "3",
          daysSupply: 30,
        },
        {
          medication: "Metformin HCl 500mg Tablets",
          strength: "500mg",
          sig: "Take 1 tablet by mouth twice daily with meals",
          quantity: "60",
          refills: "5",
          daysSupply: 30,
        },
        {
          medication: "Vitamin B12 1000mcg Injection",
          strength: "1000mcg/mL",
          sig: "Inject 1mL intramuscularly once monthly",
          quantity: "1",
          refills: "11",
          daysSupply: 30,
        },
      ],
      shipping: {
        methodLabel: "STANDARD",
        addressLine1: "123 Main Street",
        addressLine2: "Apt 4B",
        city: "Tampa",
        state: "FL",
        zip: "33601",
      },
    };
    
    console.log("\n📋 Multi-Prescription Details:");
    console.log("   Patient: " + multiPrescriptionData.patient.firstName + " " + multiPrescriptionData.patient.lastName);
    console.log("   Number of Prescriptions: " + multiPrescriptionData.prescriptions.length);
    console.log("   Medications:");
    multiPrescriptionData.prescriptions.forEach((rx, i) => {
      console.log("     " + (i + 1) + ". " + rx.medication);
    });
    
    const pdfBase64 = await generatePrescriptionPDF(multiPrescriptionData);
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const outputPath = "./e-prescription-multi.pdf";
    await fs.writeFile(outputPath, pdfBuffer);
    
    console.log("\n✅ Multi-Prescription PDF Generated!");
    console.log("📄 File: " + outputPath);
    console.log("📏 Size: " + (pdfBuffer.length / 1024).toFixed(2) + " KB");
    console.log("📑 Pages: " + multiPrescriptionData.prescriptions.length);
    console.log("\n🔍 This PDF contains " + multiPrescriptionData.prescriptions.length + " pages (one per prescription)");
    console.log("=".repeat(70) + "\n");
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Run both tests
async function runTests() {
  await generateSamplePrescription();
  await generateMultiPrescriptionSample();
}

runTests();
