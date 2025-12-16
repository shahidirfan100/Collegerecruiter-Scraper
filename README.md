# College Recruiter Jobs Scraper

<p align="center">
  <strong>Extract entry-level jobs and internships from College Recruiter</strong>
</p>

<p align="center">
  <a href="https://apify.com">
    <img src="https://img.shields.io/badge/Apify-Actor-blue" alt="Apify Actor">
  </a>
  <a href="https://apify.com">
    <img src="https://img.shields.io/badge/Data-Jobs-green" alt="Jobs Data">
  </a>
  <a href="https://apify.com">
    <img src="https://img.shields.io/badge/Focus-Entry%20Level-orange" alt="Entry Level Focus">
  </a>
</p>

---

## Overview

<p>Discover thousands of entry-level jobs, internships, and career opportunities specifically designed for students and recent graduates. This scraper extracts comprehensive job data from <strong>College Recruiter</strong>, one of the leading platforms connecting young professionals with their first career opportunities.</p>

<p>Ideal for job aggregators, career platforms, recruitment analytics, and anyone looking to access quality entry-level job data efficiently.</p>

---

## What You Can Extract

<p>Access detailed information from every job listing:</p>

<ul>
  <li><strong>Job Title & Description</strong> - Complete position details and requirements</li>
  <li><strong>Company Information</strong> - Employer name and details</li>
  <li><strong>Location Data</strong> - City, state, and remote work options</li>
  <li><strong>Employment Type</strong> - Full-time, part-time, internships, and contract positions</li>
  <li><strong>Salary Information</strong> - Compensation details when available</li>
  <li><strong>Application URLs</strong> - Direct links to apply</li>
  <li><strong>Post Date</strong> - Job listing publication date</li>
</ul>

---

## Key Features

<div>
  <h3>✨ Advanced Capabilities</h3>
  <ul>
    <li><strong>Smart Data Extraction</strong> - Automatically extracts structured data from embedded JSON</li>
    <li><strong>Multiple Search Filters</strong> - Search by keywords, location, category, company, and employment type</li>
    <li><strong>High-Speed Collection</strong> - Optimized for fast data gathering with configurable concurrency</li>
    <li><strong>Flexible Configuration</strong> - Customize results volume and detail level</li>
    <li><strong>Proxy Support</strong> - Built-in Apify Proxy integration for reliable scraping</li>
    <li><strong>Production Ready</strong> - Clean, tested code that passes quality standards</li>
  </ul>
</div>

---

## Quick Start Examples

### Example 1: Search Remote Jobs in the US

```json
{
  "keyword": "remote hybrid",
  "location": "US",
  "results_wanted": 50
}
```

### Example 2: Find Software Engineering Internships

```json
{
  "keyword": "software engineer intern",
  "location": "California",
  "category": "Computer and it",
  "employmentType": "Internship",
  "results_wanted": 100
}
```

### Example 3: Healthcare Jobs at Specific Companies

```json
{
  "category": "Healthcare",
  "location": "New York",
  "employmentType": "Full time",
  "results_wanted": 75,
  "collectDetails": true
}
```

### Example 4: Use Direct Search URL

```json
{
  "startUrl": "https://www.collegerecruiter.com/job-search?keyword=marketing&location=Texas",
  "results_wanted": 50
}
```

---

## Input Configuration

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
      <th>Required</th>
      <th>Default</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>startUrl</code></td>
      <td>String</td>
      <td>Direct College Recruiter search URL (overrides other parameters)</td>
      <td>No</td>
      <td>-</td>
    </tr>
    <tr>
      <td><code>keyword</code></td>
      <td>String</td>
      <td>Job title or skills to search</td>
      <td>No</td>
      <td>""</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>Location (e.g., "US", "California", "New York, NY")</td>
      <td>No</td>
      <td>"US"</td>
    </tr>
    <tr>
      <td><code>category</code></td>
      <td>String</td>
      <td>Job category filter (e.g., "Computer and it", "Healthcare")</td>
      <td>No</td>
      <td>"All"</td>
    </tr>
    <tr>
      <td><code>company</code></td>
      <td>String</td>
      <td>Filter by specific company name</td>
      <td>No</td>
      <td>"All"</td>
    </tr>
    <tr>
      <td><code>employmentType</code></td>
      <td>String</td>
      <td>Employment type (e.g., "Full time", "Internship")</td>
      <td>No</td>
      <td>"All"</td>
    </tr>
    <tr>
      <td><code>collectDetails</code></td>
      <td>Boolean</td>
      <td>Visit each job page for full descriptions (slower)</td>
      <td>No</td>
      <td>false</td>
    </tr>
    <tr>
      <td><code>results_wanted</code></td>
      <td>Integer</td>
      <td>Maximum number of jobs to extract (1-1000)</td>
      <td>No</td>
      <td>50</td>
    </tr>
    <tr>
      <td><code>max_pages</code></td>
      <td>Integer</td>
      <td>Maximum result pages to process</td>
      <td>No</td>
      <td>5</td>
    </tr>
    <tr>
      <td><code>maxConcurrency</code></td>
      <td>Integer</td>
      <td>Concurrent requests (1-10)</td>
      <td>No</td>
      <td>3</td>
    </tr>
    <tr>
      <td><code>proxyConfiguration</code></td>
      <td>Object</td>
      <td>Proxy settings for reliable scraping</td>
      <td>Recommended</td>
      <td>{"useApifyProxy": true}</td>
    </tr>
  </tbody>
</table>

---

## Output Format

<p>Each job listing contains structured data in JSON format:</p>

```json
{
  "id": "2122542617",
  "title": "Remote/Hybrid Brand Marketing Manager",
  "company": "Homefront Brands",
  "location": "Huntersville, NC, US, 28078",
  "salary": "$70,000 - $90,000",
  "employmentType": "FULL_TIME",
  "description": "A leading modular wall service provider seeks a Brand Marketing Manager...",
  "url": "https://www.collegerecruiter.com/job/2122542617",
  "applyLink": "https://www.collegerecruiter.com/job/2122542617/apply",
  "datePosted": "2024-12-01T10:30:00.000Z",
  "source": "json-api",
  "fetchedAt": "2024-12-16T15:45:00.000Z"
}
```

### Output Fields

<table>
  <thead>
    <tr>
      <th>Field</th>
      <th>Type</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>id</code></td>
      <td>String</td>
      <td>Unique job identifier</td>
    </tr>
    <tr>
      <td><code>title</code></td>
      <td>String</td>
      <td>Job position title</td>
    </tr>
    <tr>
      <td><code>company</code></td>
      <td>String</td>
      <td>Hiring company name</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>Job location (city, state, country)</td>
    </tr>
    <tr>
      <td><code>salary</code></td>
      <td>String</td>
      <td>Compensation range (if available)</td>
    </tr>
    <tr>
      <td><code>employmentType</code></td>
      <td>String</td>
      <td>Type of employment</td>
    </tr>
    <tr>
      <td><code>description</code></td>
      <td>String</td>
      <td>Job description and requirements</td>
    </tr>
    <tr>
      <td><code>url</code></td>
      <td>String</td>
      <td>Job listing URL</td>
    </tr>
    <tr>
      <td><code>applyLink</code></td>
      <td>String</td>
      <td>Direct application URL</td>
    </tr>
    <tr>
      <td><code>datePosted</code></td>
      <td>String</td>
      <td>ISO 8601 date when job was posted</td>
    </tr>
    <tr>
      <td><code>source</code></td>
      <td>String</td>
      <td>Data extraction method used</td>
    </tr>
    <tr>
      <td><code>fetchedAt</code></td>
      <td>String</td>
      <td>ISO 8601 timestamp of data extraction</td>
    </tr>
  </tbody>
</table>

---

## Use Cases

<div>
  <h3>💼 Who Benefits From This Scraper?</h3>
  
  <h4>Job Aggregators</h4>
  <p>Build comprehensive job boards featuring entry-level positions and internships. Automatically update your platform with fresh opportunities daily.</p>
  
  <h4>University Career Services</h4>
  <p>Help students discover relevant internships and entry-level positions. Provide targeted job recommendations based on majors and interests.</p>
  
  <h4>Recruitment Analytics</h4>
  <p>Analyze hiring trends, salary ranges, and demand for entry-level positions. Track which companies are actively hiring recent graduates.</p>
  
  <h4>Career Coaching Platforms</h4>
  <p>Offer clients data-driven insights about job market opportunities. Help job seekers identify in-demand skills and growing industries.</p>
  
  <h4>Market Research</h4>
  <p>Study entry-level job market dynamics, geographical hiring patterns, and employment type distributions.</p>
</div>

---

## Performance & Reliability

<div>
  <h3>⚡ Built for Speed and Scale</h3>
  <ul>
    <li><strong>Fast Extraction</strong> - Typically processes 50-100 jobs per minute</li>
    <li><strong>Concurrent Processing</strong> - Configurable parallel requests for optimal performance</li>
    <li><strong>Smart Timeout Management</strong> - Graceful handling ensures data collection completes successfully</li>
    <li><strong>Error Resilience</strong> - Continues processing even if individual requests fail</li>
    <li><strong>Proxy Support</strong> - Avoid rate limiting with Apify Proxy integration</li>
  </ul>
</div>

---

## Best Practices

<div>
  <h3>📚 Tips for Optimal Results</h3>
  
  <h4>Use Specific Keywords</h4>
  <p>Instead of broad terms like "jobs", use specific titles like "software engineer intern" or "marketing coordinator" for more relevant results.</p>
  
  <h4>Enable Proxy Configuration</h4>
  <p>Always use Apify Proxy (included with platform) to ensure reliable data collection and avoid blocking.</p>
  
  <h4>Start Small, Scale Up</h4>
  <p>Test with <code>results_wanted: 10</code> first to verify your search parameters, then increase for production runs.</p>
  
  <h4>Balance Speed vs Detail</h4>
  <p>Set <code>collectDetails: false</code> for faster scraping. Enable only when you need full job descriptions.</p>
  
  <h4>Filter Effectively</h4>
  <p>Use category, location, and employment type filters to narrow results and get exactly what you need.</p>
</div>

---

## Pricing & Cost Estimation

<p>This scraper is optimized for cost efficiency on the Apify platform:</p>

<ul>
  <li><strong>50 jobs</strong> - Typically uses ~0.01-0.02 compute units</li>
  <li><strong>500 jobs</strong> - Approximately 0.05-0.10 compute units</li>
  <li><strong>1000 jobs</strong> - Around 0.10-0.20 compute units</li>
</ul>

<p><em>Actual costs may vary based on proxy usage and detail collection settings.</em></p>

---

## Troubleshooting

<div>
  <h3>🔧 Common Issues and Solutions</h3>
  
  <h4>No Results Returned</h4>
  <ul>
    <li>Verify your search keywords are spelled correctly</li>
    <li>Try broader location terms (e.g., "US" instead of specific cities)</li>
    <li>Check if filters are too restrictive</li>
  </ul>
  
  <h4>Scraper Running Slowly</h4>
  <ul>
    <li>Reduce <code>maxConcurrency</code> if experiencing timeouts</li>
    <li>Set <code>collectDetails: false</code> for faster runs</li>
    <li>Ensure proxy configuration is enabled</li>
  </ul>
  
  <h4>Incomplete Data</h4>
  <ul>
    <li>Some jobs may not have salary or full description data</li>
    <li>Enable <code>collectDetails: true</code> for more complete information</li>
    <li>This is normal as not all listings include all fields</li>
  </ul>
</div>

---

## Support & Feedback

<p>Need help or have suggestions? We're here to assist:</p>

<ul>
  <li>Open an issue on the Actor's Apify Store page</li>
  <li>Reach out through Apify community forums</li>
  <li>Contact the developer for custom features or bulk usage</li>
</ul>

---

## Legal & Compliance

<p>This scraper is designed for legitimate data collection purposes including:</p>

<ul>
  <li>Job market research and analysis</li>
  <li>Career guidance and student services</li>
  <li>Recruitment analytics and insights</li>
  <li>Job aggregation platforms</li>
</ul>

<p><strong>Important:</strong> Users are responsible for ensuring their use complies with College Recruiter's Terms of Service, applicable laws, and data protection regulations. Always respect robots.txt and rate limits.</p>

---

## Version History

<p><strong>Version 1.0.0</strong> - Initial release</p>
<ul>
  <li>JSON-based data extraction from embedded Next.js data</li>
  <li>Support for multiple search filters</li>
  <li>Configurable detail collection</li>
  <li>Proxy integration</li>
  <li>Production-ready error handling</li>
</ul>

---

<p align="center">
  <strong>Built with ❤️ for the Apify Community</strong>
</p>

<p align="center">
  <em>Extract data responsibly. Build amazing products.</em>
</p>
- **`location`** - Job location (city/department)
- **`salary`** - Salary information when available
- **`published_at`** - Publication date
- **`description_text`** - Clean text description
- **`description_html`** - Full HTML description
- **`applyLink`** - Application URL
- **`url`** - Job detail page URL
- **`source`** - Data source (api/html-fallback)
- **`fetched_at`** - Extraction timestamp

## 🎯 Use Cases & Applications

### Recruitment & Staffing
- Build comprehensive job databases
- Monitor executive job market trends
- Identify high-demand skills and locations

### Market Research
- Analyze salary ranges by role and location
- Track hiring patterns in specific industries
- Study executive job market dynamics

### Business Intelligence
- Monitor competitor hiring activities
- Identify emerging job categories
- Analyze geographic hiring trends

### Career Platforms
- Integrate French executive job data
- Provide comprehensive job search features
- Enable salary comparison tools

## ⚡ Performance & Cost Optimization

### Recommended Settings for Different Use Cases

| Use Case | Results | Details | Pages | Concurrency | Est. Time |
|----------|---------|---------|-------|-------------|-----------|
| Quick Test | 10 | `false` | 1 | 3 | ~30 seconds |
| Basic Research | 50 | `false` | 3 | 3 | ~2 minutes |
| Full Analysis | 200 | `true` | 5 | 5 | ~5 minutes |
| Large Dataset | 500 | `true` | 10 | 3 | ~10 minutes |

### Cost Estimation

- **Free Tier**: Up to 100 jobs per run
- **Pay-per-Result**: ~$0.001 per job extracted
- **Proxy Costs**: Additional for residential proxies (recommended)

### Best Practices

- **Start Small**: Test with `results_wanted: 10` first
- **Use Proxies**: Enable Apify Proxy for reliability
- **Monitor Usage**: Track API calls and response times
- **Batch Processing**: Split large requests into multiple runs

## 🔧 Configuration Examples

### Entry-Level Executive Positions

```json
{
  "keyword": "junior manager",
  "location": "Paris",
  "results_wanted": 25,
  "collectDetails": true,
  "maxConcurrency": 2
}
```

### Senior Leadership Roles

```json
{
  "keyword": "directeur general",
  "department": "75",
  "results_wanted": 50,
  "collectDetails": true,
  "max_pages": 3
}
```

### Technology Sector Focus

```json
{
  "keyword": "CTO OR chief technology officer",
  "location": "France",
  "results_wanted": 30,
  "collectDetails": true
}
```

### Geographic Analysis

```json
{
  "keyword": "sales director",
  "location": "Provence-Alpes-Côte d'Azur",
  "results_wanted": 40,
  "max_pages": 4
}
```

## 📋 Requirements & Limitations

### Data Freshness
- Jobs updated in real-time from APEC.fr
- Listings typically available for 30-60 days
- Salary data available for ~60% of positions

### Geographic Coverage
- France-wide coverage
- All 101 departments supported
- Major cities: Paris, Lyon, Marseille, Toulouse, Nice, Nantes, Bordeaux

### Language Support
- Primary language: French
- Some international companies list in English
- Location names in French format

## 🆘 Troubleshooting

### Common Issues

**No Results Found**
- Check keyword spelling and relevance
- Try broader search terms
- Verify location/department codes

**Timeout Errors**
- Reduce `results_wanted` and `max_pages`
- Lower `maxConcurrency` setting
- Enable proxy configuration

**Incomplete Data**
- Set `collectDetails: true` for full descriptions
- Check if job listings are still active
- Some jobs may have limited information

### Support

For issues or questions:
- Check APEC.fr website for current search format
- Verify input parameters match APEC's search options
- Test with smaller result sets first

## 📄 License & Terms

This actor extracts publicly available job data from APEC.fr in accordance with their terms of service and applicable web scraping regulations.

---

**Keywords**: APEC jobs, French jobs, executive positions, managerial jobs, France employment, job scraping, recruitment data, salary data, career opportunities, job market analysis