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
      console.error('Missing credentials:', { 
        hasToken: !!ASANA_TOKEN, 
        hasProjectId: !!ASANA_PROJECT_ID 
      });
      throw new Error('Missing Asana configuration');
    }
    
    // Create the task description
    const taskDescription = generateTaskDescription(data);
    
    // Create Asana task using fetch (built into Node 18+)
    const taskResponse = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ASANA_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        data: {
          name: `Permit Application - ${data.companyName}`,
          notes: taskDescription,
          projects: [ASANA_PROJECT_ID]
        }
      })
    });
    
    const responseText = await taskResponse.text();
    console.log('Asana response status:', taskResponse.status);
    console.log('Asana response:', responseText);
    
    let taskResult;
    try {
      taskResult = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Asana response:', responseText);
      throw new Error('Invalid response from Asana API');
    }
    
    if (!taskResponse.ok) {
      console.error('Asana API error:', taskResult);
      throw new Error(`Asana API error: ${taskResult.errors?.[0]?.message || 'Unknown error'}`);
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
        taskUrl: taskResult.data.permalink_url || `https://app.asana.com/0/${ASANA_PROJECT_ID}/${taskResult.data.gid}`,
        message: 'Application submitted successfully to Asana'
      })
    };
    
  } catch (error) {
    console.error('Function error:', error.message);
    console.error('Full error:', error);
    
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

EMPLOYMENT DETAILS
• Year 1 New Jobs: ${data.newJobsYear1 || 0}
• Year 2 New Jobs: ${data.newJobsYear2 || 0}
• Year 3 New Jobs: ${data.newJobsYear3 || 0}
• Expected New Residents: ${data.peopleMoving || 0}

INVESTMENT BREAKDOWN
• Land/Building Purchase: $${parseInt(data.landPurchase || 0).toLocaleString()}
• Construction/Upfit: $${parseInt(data.construction || 0).toLocaleString()}
• Furniture, Fixtures & Equipment: $${parseInt(data.furniture || 0).toLocaleString()}
• Computer & Peripheral Equipment: $${parseInt(data.computers || 0).toLocaleString()}

${data.ownershipType === 'lease' ? `
LEASE TERMS
• Term: ${data.leaseTerm || 'N/A'} years
• Annual Payment: $${parseInt(data.leasePayments || 0).toLocaleString()}
• Lease Rate: ${data.leaseRate || 'N/A'}
` : 'OWNERSHIP TYPE: Purchase'}

PROJECT DETAILS
• Site Size: ${data.siteSize || 'N/A'} acres
• Building Size: ${data.buildingSize || 'N/A'} sq ft
• Upfit Size: ${data.upfitSize || 'N/A'} sq ft

TIMELINE
• Application Date: ${new Date(data.submissionDate).toLocaleDateString()}
• Desired Occupancy: ${data.occupancyDate ? new Date(data.occupancyDate).toLocaleDateString() : 'TBD'}
• Site Plan Submittal: ${data.sitePlanDate ? new Date(data.sitePlanDate).toLocaleDateString() : 'TBD'}
• Building Plan Submittal: ${data.buildingPlanDate ? new Date(data.buildingPlanDate).toLocaleDateString() : 'TBD'}
• Upfit Plan Submittal: ${data.upfitPlanDate ? new Date(data.upfitPlanDate).toLocaleDateString() : 'TBD'}

COMMITMENTS
• Annual Reports: ${data.annualReports ? '✓ Agreed' : '✗ Not Agreed'}
• Public Announcement: ${data.publicAnnouncement ? '✓ Agreed' : '✗ Not Agreed'}

APPLICATION STATUS
• Submitted by: ${data.signature}
• Date: ${new Date(data.dateSign).toLocaleDateString()}
• Company HQ: ${data.hqAddress || 'Not provided'}

---
This task was automatically created from the Prince William County permit application form.`;
}
