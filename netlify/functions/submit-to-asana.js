const PDFDocument = require('pdfkit');

// Custom field GID mapping
const CUSTOM_FIELDS = {
  companyName: '1210373107979908',
  contactName: '1210373107979910',
  contactEmail: '1210373107979912',
  contactPhone: '1210373107979914',
  projectType: '1210373107979916',
  projectAddress: '1210373108816529',
  siteSize: '1210373108816531',
  buildingSize: '1210373108816533',
  totalInvestment: '1210373108816535',
  landPurchase: '1210373108816537',
  construction: '1210373108816539',
  equipmentCost: '1210373108816541',
  retainedJobs: '1210373108816543',
  newJobsYear1: '1210373108816545',
  newJobsYear2: '1210373108816547',
  newJobsYear3: '1210373108816549',
  averageWage: '1210373108816551',
  applicationDate: '1210373108816553',
  occupancyDate: '1210373108816555',
  sitePlanDate: '1210373108816557',
  buildingPlanDate: '1210373108816559',
  priority: '1210373108825690',
  applicationStatus: '1210373109511455'
};

// Enum option GIDs
const PROJECT_TYPE_OPTIONS = {
  'new': '1210373107979917',      // New Construction
  'upfit': '1210373107979918',    // Upfit
  'both': '1210373108816527'      // Both
};

const PRIORITY_OPTIONS = {
  'high': '1210373109215115',     // High
  'medium': '1210373109215116',   // Medium
  'low': '1210373109215117'       // Low
};

const STATUS_OPTIONS = {
  'complete': '1210373109511456',    // Complete
  'incomplete': '1210373109511457',  // Incomplete
  'pending': '1210373109511458'      // Pending Info
};

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    const ASANA_TOKEN = process.env.ASANA_TOKEN;
    const ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID;
    
    if (!ASANA_TOKEN || !ASANA_PROJECT_ID) {
      throw new Error('Missing Asana configuration');
    }
    
    // Generate PDF
    console.log('Generating PDF...');
    const pdfBuffer = await generatePDF(data);
    console.log('PDF generated, size:', pdfBuffer.length);
    
    // Build custom fields object
    const customFields = buildCustomFields(data);
    console.log('Custom fields built:', Object.keys(customFields).length);
    
    // Create Asana task
    const taskData = {
      data: {
        name: `TIS Application - ${data.companyName}`,
        notes: generateTaskDescription(data),
        projects: [ASANA_PROJECT_ID],
        custom_fields: customFields,
        due_on: data.occupancyDate || null
      }
    };
    
    console.log('Creating Asana task...');
    const taskResponse = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(taskData)
    });
    
    const taskResult = await taskResponse.json();
    
    if (!taskResponse.ok) {
      console.error('Asana API error:', taskResult);
      throw new Error(`Asana API error: ${taskResult.errors?.[0]?.message || 'Unknown error'}`);
    }
    
    console.log('Task created:', taskResult.data.gid);
    
    // Upload PDF as attachment
    console.log('Uploading PDF to Asana...');
    
    // Create form data with proper blob
    const boundary = '----FormBoundary' + Math.random().toString(36);
    const formData = [];
    
    // Add parent field
    formData.push(`------${boundary}`);
    formData.push('Content-Disposition: form-data; name="parent"');
    formData.push('');
    formData.push(taskResult.data.gid);
    
    // Add file field
    formData.push(`------${boundary}`);
    formData.push(`Content-Disposition: form-data; name="file"; filename="TIS_Application_${data.companyName.replace(/\s+/g, '_')}.pdf"`);
    formData.push('Content-Type: application/pdf');
    formData.push('');
    
    // Convert formData array to buffer and append PDF
    const textPart = Buffer.from(formData.join('\r\n') + '\r\n');
    const endBoundary = Buffer.from(`\r\n------${boundary}--\r\n`);
    const bodyBuffer = Buffer.concat([textPart, pdfBuffer, endBoundary]);
    
    const attachmentResponse = await fetch('https://app.asana.com/api/1.0/attachments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_TOKEN}`,
        'Content-Type': `multipart/form-data; boundary=----${boundary}`
      },
      body: bodyBuffer
    });
    
    const attachmentResult = await attachmentResponse.json();
    
    if (!attachmentResponse.ok) {
      console.error('Attachment upload failed:', attachmentResult);
      // Don't fail the whole request if attachment fails
      console.log('Continuing without attachment...');
    } else {
      console.log('PDF attached successfully');
    }
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        taskId: taskResult.data.gid,
        taskUrl: taskResult.data.permalink_url || `https://app.asana.com/0/${ASANA_PROJECT_ID}/${taskResult.data.gid}`,
        message: 'Application submitted successfully to Asana'
      })
    };
    
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

function buildCustomFields(data) {
  const fields = {};
  
  // Text fields
  if (data.companyName) fields[CUSTOM_FIELDS.companyName] = data.companyName;
  if (data.contactName) fields[CUSTOM_FIELDS.contactName] = data.contactName;
  if (data.contactEmail) fields[CUSTOM_FIELDS.contactEmail] = data.contactEmail;
  if (data.contactPhone) fields[CUSTOM_FIELDS.contactPhone] = data.contactPhone;
  if (data.projectAddress) fields[CUSTOM_FIELDS.projectAddress] = data.projectAddress;
  
  // Number fields
  if (data.siteSize) fields[CUSTOM_FIELDS.siteSize] = parseFloat(data.siteSize);
  if (data.buildingSize) fields[CUSTOM_FIELDS.buildingSize] = parseInt(data.buildingSize);
  if (data.totalInvestment) fields[CUSTOM_FIELDS.totalInvestment] = parseInt(data.totalInvestment);
  if (data.landPurchase) fields[CUSTOM_FIELDS.landPurchase] = parseInt(data.landPurchase);
  if (data.construction) fields[CUSTOM_FIELDS.construction] = parseInt(data.construction);
  
  // Equipment cost combines furniture + computers
  const equipmentTotal = (parseInt(data.furniture || 0) + parseInt(data.computers || 0));
  if (equipmentTotal > 0) fields[CUSTOM_FIELDS.equipmentCost] = equipmentTotal;
  
  if (data.retainedJobs) fields[CUSTOM_FIELDS.retainedJobs] = parseInt(data.retainedJobs);
  if (data.newJobsYear1) fields[CUSTOM_FIELDS.newJobsYear1] = parseInt(data.newJobsYear1);
  if (data.newJobsYear2) fields[CUSTOM_FIELDS.newJobsYear2] = parseInt(data.newJobsYear2);
  if (data.newJobsYear3) fields[CUSTOM_FIELDS.newJobsYear3] = parseInt(data.newJobsYear3);
  if (data.averageWage) fields[CUSTOM_FIELDS.averageWage] = parseInt(data.averageWage);
  
  // Date fields - Asana requires object format
  fields[CUSTOM_FIELDS.applicationDate] = { date: new Date().toISOString().split('T')[0] };
  if (data.occupancyDate) {
    fields[CUSTOM_FIELDS.occupancyDate] = { date: data.occupancyDate };
  }
  if (data.sitePlanDate) {
    fields[CUSTOM_FIELDS.sitePlanDate] = { date: data.sitePlanDate };
  }
  if (data.buildingPlanDate) {
    fields[CUSTOM_FIELDS.buildingPlanDate] = { date: data.buildingPlanDate };
  }
  
  // Enum fields with actual GIDs
  if (data.projectType && PROJECT_TYPE_OPTIONS[data.projectType]) {
    fields[CUSTOM_FIELDS.projectType] = PROJECT_TYPE_OPTIONS[data.projectType];
  }
  
  // Set priority based on investment amount or timeline
  const daysUntilOccupancy = data.occupancyDate ? 
    Math.floor((new Date(data.occupancyDate) - new Date()) / (1000 * 60 * 60 * 24)) : 999;
  
  if (parseInt(data.totalInvestment) > 5000000 || daysUntilOccupancy < 90) {
    fields[CUSTOM_FIELDS.priority] = PRIORITY_OPTIONS.high;
  } else if (parseInt(data.totalInvestment) > 1000000 || daysUntilOccupancy < 180) {
    fields[CUSTOM_FIELDS.priority] = PRIORITY_OPTIONS.medium;
  } else {
    fields[CUSTOM_FIELDS.priority] = PRIORITY_OPTIONS.low;
  }
  
  // Set application status to complete
  fields[CUSTOM_FIELDS.applicationStatus] = STATUS_OPTIONS.complete;
  
  return fields;
}

async function generatePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header with gradient effect (simulated with rectangle)
      doc.rect(0, 0, doc.page.width, 6)
         .fill('#ff0088');
      
      // Title
      doc.fillColor('#1b2f52')
         .fontSize(24)
         .text('Prince William County', 50, 50, { align: 'center' })
         .fontSize(18)
         .text('Department of Economic Development', { align: 'center' })
         .fontSize(14)
         .text('Targeted Industry/Expedited Permitting Application', { align: 'center' })
         .moveDown(2);
      
      // Application info box
      doc.fontSize(10)
         .fillColor('#666')
         .text(`Application Date: ${new Date().toLocaleDateString()}`, { align: 'right' })
         .moveDown();
      
      // Company Information Section
      addSection(doc, 'Company Information');
      
      doc.fontSize(11).fillColor('#333');
      addField(doc, 'Company Name', data.companyName);
      addField(doc, 'Headquarters Address', data.hqAddress || 'Not provided');
      addField(doc, 'Project Location', data.projectAddress);
      doc.moveDown();
      
      addField(doc, 'Contact Person', `${data.contactName}, ${data.contactTitle}`);
      addField(doc, 'Phone', data.contactPhone);
      addField(doc, 'Email', data.contactEmail);
      doc.moveDown(1);
      
      // Project Details Section
      addSection(doc, 'Project Details');
      
      addField(doc, 'Project Type', formatProjectType(data.projectType));
      doc.fontSize(11).fillColor('#333').text('Business Activities:', { continued: true });
      doc.fontSize(11).fillColor('#000').text('');
      doc.fontSize(10).fillColor('#555').text(data.activities || 'Not provided', {
        indent: 20,
        align: 'justify'
      });
      doc.moveDown();
      
      if (data.siteSize) addField(doc, 'Site Size', `${data.siteSize} acres`);
      if (data.buildingSize) addField(doc, 'Building Size', `${parseInt(data.buildingSize).toLocaleString()} sq ft`);
      if (data.upfitSize) addField(doc, 'Upfit Size', `${parseInt(data.upfitSize).toLocaleString()} sq ft`);
      doc.moveDown(1);
      
      // Employment Impact Section
      addSection(doc, 'Employment Impact');
      
      const totalNewJobs = (parseInt(data.newJobsYear1 || 0) + 
                          parseInt(data.newJobsYear2 || 0) + 
                          parseInt(data.newJobsYear3 || 0));
      
      // Employment summary box
      const boxY = doc.y;
      doc.rect(50, boxY, doc.page.width - 100, 60)
         .stroke('#ff0088');
      doc.fontSize(12).fillColor('#ff0088')
         .text(`Total New Jobs: ${totalNewJobs}`, 60, boxY + 10);
      doc.fontSize(11).fillColor('#1b2f52')
         .text(`Average Annual Wage: $${parseInt(data.averageWage || 0).toLocaleString()}`, 60, boxY + 30);
      doc.y = boxY + 70;
      
      addField(doc, 'Jobs to be Retained', data.retainedJobs || '0');
      addField(doc, 'New Jobs - Year 1', data.newJobsYear1 || '0');
      addField(doc, 'New Jobs - Year 2', data.newJobsYear2 || '0');
      addField(doc, 'New Jobs - Year 3', data.newJobsYear3 || '0');
      addField(doc, 'Expected New Residents', data.peopleMoving || '0');
      
      // Check if we need a new page
      if (doc.y > 500) {
        doc.addPage();
      } else {
        doc.moveDown(1);
      }
      
      // Capital Investment Section
      addSection(doc, 'Capital Investment');
      
      const investments = [
        { label: 'Land/Building Purchase', value: data.landPurchase },
        { label: 'Construction/Upfit', value: data.construction },
        { label: 'Furniture, Fixtures & Equipment', value: data.furniture },
        { label: 'Computer & Peripheral Equipment', value: data.computers }
      ];
      
      investments.forEach(inv => {
        if (inv.value) {
          addField(doc, inv.label, `$${parseInt(inv.value).toLocaleString()}`);
        }
      });
      
      // Total investment highlighted
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#ff0088')
         .text('TOTAL INVESTMENT: ', { continued: true })
         .fillColor('#1b2f52')
         .text(`$${parseInt(data.totalInvestment || 0).toLocaleString()}`);
      doc.moveDown(1);
      
      // Lease terms if applicable
      if (data.ownershipType === 'lease' && data.leaseTerm) {
        doc.fontSize(11).fillColor('#333');
        addField(doc, 'Lease Term', `${data.leaseTerm} years`);
        if (data.leasePayments) addField(doc, 'Annual Lease Payment', `$${parseInt(data.leasePayments).toLocaleString()}`);
        if (data.leaseRate) addField(doc, 'Lease Rate', data.leaseRate);
        doc.moveDown(1);
      }
      
      // Timeline Section
      addSection(doc, 'Project Timeline');
      
      const dates = [
        { label: 'Site Plan Submittal', value: data.sitePlanDate },
        { label: 'Building Plan Submittal', value: data.buildingPlanDate },
        { label: 'Upfit Plan Submittal', value: data.upfitPlanDate },
        { label: 'Desired Occupancy Date', value: data.occupancyDate }
      ];
      
      dates.forEach(date => {
        if (date.value) {
          addField(doc, date.label, new Date(date.value).toLocaleDateString());
        }
      });
      doc.moveDown(1);
      
      // Commitments Section
      addSection(doc, 'Commitments');
      
      doc.fontSize(11).fillColor('#333');
      doc.text('• ', { continued: true })
         .text(`Annual Employment Reports: ${data.annualReports ? 'Yes' : 'No'}`);
      doc.text('• ', { continued: true })
         .text(`Public Announcement Agreement: ${data.publicAnnouncement ? 'Yes' : 'No'}`);
      doc.moveDown(2);
      
      // Signature Section
      const sigBoxY = doc.y;
      doc.rect(50, sigBoxY, doc.page.width - 100, 80)
         .stroke('#ddd');
      doc.y = sigBoxY + 10;
      doc.fontSize(10).fillColor('#666')
         .text('I certify that all items in this application are accurate and complete to the best of my knowledge.', 50, doc.y, {
           width: doc.page.width - 100,
           align: 'center'
         });
      doc.moveDown();
      doc.fontSize(11).fillColor('#333');
      addField(doc, 'Signature', data.signature);
      addField(doc, 'Date', new Date(data.dateSign).toLocaleDateString());
      
      // Footer
      doc.fontSize(9).fillColor('#999');
      const footerY = doc.page.height - 80;
      doc.text('Prince William County Department of Economic Development and Tourism', 50, footerY, { 
        width: doc.page.width - 100,
        align: 'center' 
      });
      doc.text('13575 Heathcote Boulevard, Suite 240, Gainesville, VA 20155 | 703-792-5500', 50, footerY + 15, { 
        width: doc.page.width - 100,
        align: 'center' 
      });
      doc.fillColor('#ff0088')
         .text('www.pwcded.org', 50, footerY + 30, { 
           width: doc.page.width - 100,
           align: 'center',
           link: 'https://www.pwcded.org' 
         });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function addSection(doc, title) {
  doc.fontSize(14)
     .fillColor('#1b2f52')
     .text(title, { underline: true })
     .moveDown(0.5);
}

function addField(doc, label, value) {
  doc.fontSize(11)
     .fillColor('#666')
     .text(`${label}: `, { continued: true })
     .fillColor('#000')
     .text(value || 'Not provided');
}

function formatProjectType(type) {
  const types = {
    'new': 'New Construction',
    'upfit': 'Upfit/Renovation',
    'both': 'New Construction & Upfit'
  };
  return types[type] || type || 'Not specified';
}

function generateTaskDescription(data) {
  const totalNewJobs = parseInt(data.totalNewJobs || 0);
  const totalInvestment = parseInt(data.totalInvestment || 0);
  
  return `PERMIT APPLICATION SUMMARY
========================

Company: ${data.companyName}
Contact: ${data.contactName} (${data.contactTitle})
Email: ${data.contactEmail}
Phone: ${data.contactPhone}

PROJECT LOCATION
${data.projectAddress}

PROJECT TYPE: ${formatProjectType(data.projectType)}

BUSINESS ACTIVITIES
${data.activities}

KEY METRICS
• Total Investment: $${totalInvestment.toLocaleString()}
• New Jobs (3 years): ${totalNewJobs}
• Average Wage: $${parseInt(data.averageWage || 0).toLocaleString()}
• Jobs Retained: ${data.retainedJobs || 0}

See attached PDF for complete application details.

---
This task was automatically created from the Prince William County permit application form.`;
}
