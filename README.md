# College Recruiter Jobs Scraper

Extract and collect fresh job listings from College Recruiter in a structured dataset. Capture job titles, company names, locations, compensation details, application links, and rich listing metadata. Built for job market research, talent intelligence, and career data products.

## Features

- **Fast large-scale collection** — Gather job listings in bulk with configurable limits.
- **Filter-ready inputs** — Narrow results by keyword, location, and employment type.
- **Rich job records** — Capture core fields plus location, compensation, posting dates, and nested metadata.
- **Consistent dataset output** — Get clean JSON records ready for dashboards, automations, and ETL pipelines.
- **Automation friendly** — Run on schedule and export in multiple formats for downstream workflows.

## Use Cases

### Job Market Intelligence
Track hiring activity by role, region, and employer to understand current demand trends. Use consistent job datasets for weekly or monthly reporting.

### Career Platform Data Feeds
Power job boards, newsletters, and candidate tools with up-to-date listings. Keep your catalog fresh without manual copy-paste workflows.

### University Career Services
Collect entry-level and early-career opportunities for students and graduates. Build targeted internal job resources by location and role type.

### Recruiting and Sourcing Research
Analyze hiring signals across companies and job categories. Identify where opportunities are opening and which employers are most active.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `startUrl` | String | No | — | Optional search URL. If provided, query values can be used as filters. |
| `keyword` | String | No | `""` | Keyword filter such as role title, skill, or phrase. |
| `location` | String | No | `"US"` | Location filter such as country, state, or city. |
| `employmentType` | String | No | `"All"` | Employment type filter: `All`, `Full time`, `Part time`, `Contractor`, `Contract to hire`, `Temporary`, `Internship`. |
| `results_wanted` | Integer | No | `20` | Maximum number of jobs to return. |
| `max_pages` | Integer | No | `10` | Search depth control for collection scope. |
| `maxConcurrency` | Integer | No | `10` | Number of concurrent requests for throughput tuning. |
| `proxyConfiguration` | Object | No | `{"useApifyProxy": true}` | Proxy settings for stability and reliability. |

---

## Output Data

Each dataset item can contain:

| Field | Type | Description |
|---|---|---|
| `id` | Number | Primary job identifier. |
| `externalId` | String | External listing identifier when available. |
| `status` | String | Listing status. |
| `title` | String | Job title. |
| `company` | String | Hiring company name. |
| `location` | String | Human-readable location string. |
| `city` | String | City from location metadata. |
| `region` | String | State or region from location metadata. |
| `country` | String | Country code or country name. |
| `postalCode` | String | Postal code when available. |
| `streetAddress` | String | Street address when available. |
| `isRemote` | Boolean | Remote flag. |
| `industry` | String | Industry/category label when available. |
| `salary` | String | Salary summary string when available. |
| `employmentType` | String | Employment type value. |
| `description` | String | Clean text job description. |
| `descriptionHtml` | String | HTML job description when available. |
| `url` | String | Job details URL. |
| `applyLink` | String | Direct application URL. |
| `datePosted` | String | Posting datetime. |
| `validThrough` | String | Listing expiration datetime. |
| `rawDateText` | String | Raw posted-date value. |
| `hiringOrganization` | Object | Hiring organization metadata. |
| `jobLocation` | Object | Structured location object. |
| `applicantLocationRequirements` | Object | Applicant location constraints. |
| `baseSalaryData` | Object | Base salary metadata object. |
| `estimatedSalaryData` | Object | Estimated salary metadata object. |
| `applicationInfo` | Object | Application metadata and links. |
| `video` | String | Video URL if present. |
| `structuredData` | Object | Structured listing metadata object. |
| `predictedIso2Lang` | String | Predicted language code. |
| `latentClickRedirectSearchDurationSeconds` | Number | Redirect/search timing metadata. |
| `forceLatentSearchRedirect` | Number | Redirect behavior metadata. |
| `fetchedAt` | String | Timestamp when the record was collected. |

---

## Usage Examples

### Quick Run (QA-friendly Defaults)

```json
{
  "keyword": "",
  "location": "US",
  "employmentType": "All",
  "results_wanted": 20,
  "max_pages": 10,
  "maxConcurrency": 10,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

### Keyword + Location Targeting

```json
{
  "keyword": "data analyst",
  "location": "California",
  "employmentType": "Full time",
  "results_wanted": 100,
  "max_pages": 20,
  "maxConcurrency": 10,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

### Start URL Driven Run

```json
{
  "startUrl": "https://www.collegerecruiter.com/job-search?keyword=marketing&location=US&employmentType=FULL_TIME",
  "results_wanted": 50,
  "max_pages": 10,
  "maxConcurrency": 10,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

---

## Sample Output

```json
{
  "id": 2330131746,
  "externalId": "131601718676",
  "status": "ACTIVE",
  "title": "Industrial HVAC Technician",
  "company": "Lee Company",
  "location": "Batesville, MS, US",
  "city": "Batesville",
  "region": "MS",
  "country": "US",
  "isRemote": false,
  "salary": null,
  "employmentType": "FULL_TIME",
  "description": "Industrial HVAC Technician at Lee Company summary...",
  "url": "https://www.collegerecruiter.com/job/2330131746-industrial-hvac-technician",
  "applyLink": "https://www.collegerecruiter.com/job/2330131746-industrial-hvac-technician/apply?title=Industrial%20HVAC%20Technician",
  "datePosted": "2026-02-09T02:40:32.000Z",
  "validThrough": "2026-03-11T02:40:32.000Z",
  "hiringOrganization": {
    "name": "Lee Company"
  },
  "jobLocation": {
    "addressLocality": "Batesville",
    "addressRegion": "MS",
    "addressCountry": "US"
  },
  "fetchedAt": "2026-02-12T06:31:17.820Z"
}
```

---

## Tips for Best Results

### Start with a Small Limit
- Use `results_wanted: 20` for quick validation.
- Increase gradually for larger production pulls.

### Keep Filters Practical
- Use broad terms first (`US`, `All`) and narrow later.
- Prefer clear role keywords over long phrases.

### Tune Throughput Safely
- Keep `maxConcurrency` moderate for stable runs.
- Increase only after verifying consistent success rates.

### Use Proxy Configuration
- Keep proxy enabled for better reliability on repeated runs.
- Use consistent proxy settings across scheduled runs.

---

## Integrations

Connect your dataset to:

- **Google Sheets** — Build reporting sheets for hiring trends.
- **Airtable** — Maintain searchable job databases.
- **Looker Studio / BI tools** — Visualize market and role insights.
- **Webhooks** — Send fresh job records to custom endpoints.
- **Make** — Automate enrichment, routing, and notifications.
- **Zapier** — Trigger downstream actions from new runs.

### Export Formats

- **JSON** — Application and API workflows.
- **CSV** — Spreadsheet and analytics workflows.
- **Excel** — Business reporting.
- **XML** — Legacy system integration.

---

## Frequently Asked Questions

### How many jobs can I collect?
Use `results_wanted` to set your target count. The actor returns up to your requested limit based on available matching listings.

### Why are some fields empty?
Some listings do not publish every attribute (for example salary or video). Empty values are expected when the source does not provide them.

### Can I filter by employment type?
Yes. Use `employmentType` with one of the supported values shown in Input Parameters.

### Can I run this on a schedule?
Yes. Schedule recurring runs in Apify and export results to your preferred destination.

### What does `max_pages` control?
It controls collection depth, helping you balance speed and coverage.

### Is the output suitable for ETL pipelines?
Yes. The dataset is structured, stable, and designed for downstream processing.

---

## Support

For issues or feature requests, use the actor page in Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [Apify API Reference](https://docs.apify.com/api/v2)
- [Apify Schedules](https://docs.apify.com/platform/schedules)

---

## Legal Notice

This actor is intended for lawful data collection and analysis. You are responsible for complying with applicable laws, platform rules, and third-party terms of use. Use collected data responsibly.
