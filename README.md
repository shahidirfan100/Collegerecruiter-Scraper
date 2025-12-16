# College Recruiter Jobs Scraper

Extract entry-level jobs, internships, and early-career opportunities from [College Recruiter](https://www.collegerecruiter.com) - one of the largest job boards for students and recent graduates in the United States.

## What data can you extract?

This scraper collects comprehensive job listing data including:

- **Job title** and unique identifier
- **Company name** and hiring organization
- **Location** (city, state, country)
- **Salary information** (when available)
- **Employment type** (Full-time, Part-time, Internship, Contract)
- **Job description** (summary or full text)
- **Application URL** and job listing link
- **Posted date** in ISO 8601 format

## Why use College Recruiter Scraper?

College Recruiter is a specialized job board focused on entry-level positions and internships for students and recent graduates. This scraper enables you to:

- **Build job aggregation platforms** with fresh entry-level opportunities
- **Power career services portals** for universities and colleges
- **Conduct job market research** and hiring trend analysis
- **Create job alert systems** for specific keywords and locations
- **Analyze salary data** for entry-level positions across industries

## How to use College Recruiter Scraper

### Example 1: Search for remote jobs

```json
{
  "keyword": "remote",
  "location": "US",
  "results_wanted": 50
}
```

### Example 2: Find software engineering internships

```json
{
  "keyword": "software engineer intern",
  "location": "California",
  "employmentType": "Internship",
  "results_wanted": 100
}
```

### Example 3: Use a direct search URL

```json
{
  "startUrl": "https://www.collegerecruiter.com/job-search?keyword=marketing&location=Texas",
  "results_wanted": 50
}
```

## Input parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `startUrl` | String | Direct College Recruiter search URL (overrides other fields) | - |
| `keyword` | String | Job title or keywords to search (e.g., "data analyst", "marketing intern") | `""` |
| `location` | String | Location to filter jobs (e.g., "US", "California", "New York, NY") | `"US"` |
| `employmentType` | String | Filter by type: "All", "Full time", "Part time", "Internship", "Contractor", "Temporary" | `"All"` |
| `collectDetails` | Boolean | Visit each job page for full descriptions (slower but more complete) | `false` |
| `results_wanted` | Integer | Maximum number of jobs to extract (1-1000) | `50` |
| `max_pages` | Integer | Maximum result pages to process (approximately 10 jobs per page) | `10` |
| `maxConcurrency` | Integer | Number of concurrent requests (1-20) | `10` |
| `proxyConfiguration` | Object | Proxy settings for reliable scraping | `{"useApifyProxy": true}` |

## Output data format

Each extracted job is saved as a JSON object with the following structure:

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
  "fetchedAt": "2025-12-16T15:45:00.000Z"
}
```

### Output fields explained

| Field | Description |
|-------|-------------|
| `id` | Unique job identifier from College Recruiter |
| `title` | Job position title |
| `company` | Name of the hiring company or organization |
| `location` | Job location (city, state, country, zip code) |
| `salary` | Compensation range when available |
| `employmentType` | Type of employment (FULL_TIME, PART_TIME, INTERN, etc.) |
| `description` | Job summary or full description text |
| `url` | Direct link to the job listing page |
| `applyLink` | Direct application URL |
| `datePosted` | When the job was posted (ISO 8601 format) |
| `fetchedAt` | When the data was extracted (ISO 8601 format) |

## Tips for best results

1. **Use specific keywords** - Search for exact job titles like "data analyst intern" rather than generic terms like "jobs"

2. **Enable proxy configuration** - Apify Proxy is recommended for reliable data collection

3. **Start with small tests** - Use `results_wanted: 10` first to verify your search parameters work correctly

4. **Balance speed and detail** - Keep `collectDetails: false` for faster runs; enable it only when you need full job descriptions

5. **Filter effectively** - Use location and employment type filters to get exactly the jobs you need

## Performance and cost

This scraper is optimized for efficiency:

| Jobs | Estimated Time | Compute Units |
|------|----------------|---------------|
| 50 jobs | ~30 seconds | ~0.01-0.02 |
| 200 jobs | ~2 minutes | ~0.05-0.08 |
| 500 jobs | ~5 minutes | ~0.10-0.15 |
| 1000 jobs | ~10 minutes | ~0.20-0.30 |

*Actual performance depends on proxy configuration and detail collection settings.*

## Frequently asked questions

**Q: Why am I getting no results?**

- Check your keyword spelling
- Try broader location terms (e.g., "US" instead of a specific city)
- Ensure your employment type filter is not too restrictive

**Q: Why is the scraper running slowly?**

- Set `collectDetails: false` for faster extraction
- Reduce `maxConcurrency` if you're experiencing timeouts
- Enable Apify Proxy for better performance

**Q: Some jobs are missing salary or description data. Is this normal?**

- Yes, not all job listings include complete information
- Enable `collectDetails: true` to get more complete data when available

**Q: Can I scrape jobs from specific companies?**

- Use the company name in your keyword search
- Filter results after extraction to find specific employers

## Use cases

This scraper is ideal for:

- **Job aggregators** building comprehensive entry-level job boards
- **University career services** helping students find internships and first jobs
- **Recruitment agencies** sourcing entry-level candidates
- **HR analytics teams** studying hiring trends and salary benchmarks
- **Career coaching platforms** providing job market insights to clients
- **Market researchers** analyzing entry-level employment opportunities

## Legal and compliance

This scraper extracts publicly available job listing data for legitimate purposes including:

- Job market research and analysis
- Career guidance and student services
- Recruitment analytics and insights
- Job aggregation platforms

**Important:** Users are responsible for ensuring their use complies with College Recruiter's Terms of Service, applicable laws, and data protection regulations.

## Support

If you encounter issues or have suggestions:

- Open an issue on the Actor's Apify Store page
- Check the Apify community forums for help
- Review the run logs for error details

---

**Last updated:** December 2025