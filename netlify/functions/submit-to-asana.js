const https = require('https');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    
    // Get Asana credentials from environment variables
    const ASANA_TOKEN = process.env.ASANA_TOKEN;
    const ASANA_PROJECT_ID = process.env.ASANA_PROJECT_ID;
    
    if (!ASANA_TOKEN || !ASANA_PROJECT_ID) {
      throw new Error('Missing Asana configuration');
    }
    
    // Generate PDF content (simplified - just HTML for now)
    const pdfContent = generateHTMLReport(data);
    
    // Create the task description
    const taskDescription = generateTaskDescription(data);
    
    // Create Asana task
    const taskData = {
      data: {
        name: `Permit Application - ${data.companyName}`,
        notes: taskDescription,
        projects: [ASANA_PROJECT_ID],
        html_notes: `<body>${taskDescription.replace(/\n/g, '<br>')}</body>`,
        due_on: data.occupancyDate || null,
      }
    };
    
    // Make request to Asana API
    const taskResult = await makeAsanaRequest('/tasks', 'POST', taskData, ASANA_TOKEN);
    
    // Add a comment with the formatted application
    if (taskResult.data && taskResult.data.gid) {
      const commentData = {
        data: {
          text: 'Application Details (PDF version available upon request)',
          html_text: `<body><strong>Application Details</strong><br/><br/>${pdfContent}</body>`
        }
      };
      
      await makeAsanaRequest(`/tasks/${taskResult.data.gid}/stories`, 'POST', commentData, ASANA_TOKEN);
    }
    
    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        taskId: taskResult.data.gid,
        taskUrl: taskResult.data.permalink_url,
        message: 'Application submitted successfully to Asana'
      })
    };
    
  } catch (error) {
    console.error('Error:', error);
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

// Helper function to make Asana API requests
function makeAsanaRequest(endpoint, method, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'app.asana.com',
      path: `/api/1.0${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            reject(new Error(`Asana API error: ${response.errors ? response.errors[0].message : 'Unknown error'}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Generate task description for Asana
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

PROJECT TYPE: ${data.projectType ? data.projectType.toUpperCase() : 'N/A'}

BUSINESS ACTIVITIES
${data.activities}

KEY METRICS
• Total Investment: $${totalInvestment.toLocaleString()}
• New Jobs (3 years): ${totalNewJobs}
• Average Wage: $${parseInt(data.averageWage || 0).toLocaleString()}
• Jobs Retained: ${data.retainedJobs || 0}

TIMELINE
• Application Date: ${new Date(data.submissionDate).toLocaleDateString()}
• Desired Occupancy: ${data.occupancyDate ? new Date(data.occupancyDate).toLocaleDateString() : 'TBD'}

COMMITMENTS
• Annual Reports: ${data.annualReports ? '✓ Agreed' : '✗ Not Agreed'}
• Public Announcement: ${data.publicAnnouncement ? '✓ Agreed' : '✗ Not Agreed'}

APPLICATION STATUS
• Submitted by: ${data.signature}
• Date: ${new Date(data.dateSign).toLocaleDateString()}`;
}

// Generate HTML report (simpler than PDF)
function generateHTMLReport(data) {
  return `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <h2 style="color: #1b2f52;">Detailed Application Report</h2>
  
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Company Information</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 5px; font-weight: bold;">Company Name:</td><td>${data.companyName}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">HQ Address:</td><td>${data.hqAddress || 'N/A'}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Contact Person:</td><td>${data.contactName}, ${data.contactTitle}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Phone:</td><td>${data.contactPhone}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Email:</td><td>${data.contactEmail}</td></tr>
  </table>
  
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Project Details</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 5px; font-weight: bold;">Location:</td><td>${data.projectAddress}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Type:</td><td>${data.projectType}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Activities:</td><td>${data.activities}</td></tr>
    ${data.siteSize ? `<tr><td style="padding: 5px; font-weight: bold;">Site Size:</td><td>${data.siteSize} acres</td></tr>` : ''}
    ${data.buildingSize ? `<tr><td style="padding: 5px; font-weight: bold;">Building Size:</td><td>${data.buildingSize} sq ft</td></tr>` : ''}
    ${data.upfitSize ? `<tr><td style="padding: 5px; font-weight: bold;">Upfit Size:</td><td>${data.upfitSize} sq ft</td></tr>` : ''}
  </table>
  
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Employment Impact</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 5px; font-weight: bold;">Jobs Retained:</td><td>${data.retainedJobs || 0}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">New Jobs Year 1:</td><td>${data.newJobsYear1 || 0}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">New Jobs Year 2:</td><td>${data.newJobsYear2 || 0}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">New Jobs Year 3:</td><td>${data.newJobsYear3 || 0}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold; color: #ff0088;">Total New Jobs:</td><td style="font-weight: bold;">${data.totalNewJobs}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Average Wage:</td><td>$${parseInt(data.averageWage || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Expected New Residents:</td><td>${data.peopleMoving || 0}</td></tr>
  </table>
  
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Capital Investment</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 5px; font-weight: bold;">Land/Building:</td><td>$${parseInt(data.landPurchase || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Construction:</td><td>$${parseInt(data.construction || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">FF&E:</td><td>$${parseInt(data.furniture || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">IT Equipment:</td><td>$${parseInt(data.computers || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold; color: #ff0088;">TOTAL:</td><td style="font-weight: bold;">$${parseInt(data.totalInvestment || 0).toLocaleString()}</td></tr>
  </table>
  
  ${data.ownershipType === 'lease' ? `
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Lease Terms</h3>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 5px; font-weight: bold;">Term:</td><td>${data.leaseTerm} years</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Annual Payment:</td><td>$${parseInt(data.leasePayments || 0).toLocaleString()}</td></tr>
    <tr><td style="padding: 5px; font-weight: bold;">Rate:</td><td>${data.leaseRate}</td></tr>
  </table>
  ` : ''}
  
  <h3 style="color: #ff0088; border-bottom: 2px solid #ff0088; padding-bottom: 5px;">Timeline</h3>
  <table style="width: 100%; border-collapse: collapse;">
    ${data.sitePlanDate ? `<tr><td style="padding: 5px; font-weight: bold;">Site Plan Due:</td><td>${new Date(data.sitePlanDate).toLocaleDateString()}</td></tr>` : ''}
    ${data.buildingPlanDate ? `<tr><td style="padding: 5px; font-weight: bold;">Building Plan Due:</td><td>${new Date(data.buildingPlanDate).toLocaleDateString()}</td></tr>` : ''}
    ${data.upfitPlanDate ? `<tr><td style="padding: 5px; font-weight: bold;">Upfit Plan Due:</td><td>${new Date(data.upfitPlanDate).toLocaleDateString()}</td></tr>` : ''}
    <tr><td style="padding: 5px; font-weight: bold;">Desired Occupancy:</td><td>${data.occupancyDate ? new Date(data.occupancyDate).toLocaleDateString() : 'TBD'}</td></tr>
  </table>
  
  <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border: 1px solid #ddd;">
    <p style="margin: 0;"><strong>Certification:</strong> All information in this application is accurate and complete.</p>
    <p style="margin: 5px 0;"><strong>Signed:</strong> ${data.signature}</p>
    <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(data.dateSign).toLocaleDateString()}</p>
  </div>
</div>
  `;
}