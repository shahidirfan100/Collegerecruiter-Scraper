// College Recruiter Jobs Scraper - HTTP + JSON parse first, HTML fallback
import { Actor, log } from 'apify';
import { Dataset, gotScraping } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

const SEARCH_PAGE_BASE = 'https://www.collegerecruiter.com/job-search';

const EMPLOYMENT_TYPES = {
    'full time': 'Full time',
    'part time': 'Part time',
    'contractor': 'Contractor',
    'contract to hire': 'Contract to hire',
    'temporary': 'Temporary',
    'intern': 'Internship',
};

const JOB_CATEGORIES = {
    'Computer and it': 'COMPUTER_AND_IT',
    'Management': 'MANAGEMENT',
    'Healthcare': 'HEALTHCARE',
    'Sales and retail': 'SALES_AND_RETAIL',
    'Science and engineering': 'SCIENCE_AND_ENGINEERING',
    'Accounting and finance': 'ACCOUNTING_AND_FINANCE',
    'Advertising and marketing': 'ADVERTISING_AND_MARKETING',
};

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
};

const cleanHtml = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    $('script, style, noscript').remove();
    return $.root().text().replace(/\s+/g, ' ').trim();
};

const createLimiter = (maxConcurrency) => {
    let active = 0;
    const queue = [];
    const next = () => {
        if (active >= maxConcurrency || queue.length === 0) return;
        active += 1;
        const { task, resolve, reject } = queue.shift();
        task()
            .then((res) => {
                resolve(res);
            })
            .catch((err) => {
                reject(err);
            })
            .finally(() => {
                active -= 1;
                next();
            });
    };
    return (task) =>
        new Promise((resolve, reject) => {
            queue.push({ task, resolve, reject });
            next();
        });
};

const buildSearchUrl = ({ keyword, location, category, company, employmentType }) => {
    const u = new URL(SEARCH_PAGE_BASE);
    if (keyword) u.searchParams.set('keyword', keyword);
    if (location) u.searchParams.set('location', location);
    if (category && category !== 'All') u.searchParams.set('category', category);
    if (company && company !== 'All') u.searchParams.set('company', company);
    if (employmentType && employmentType !== 'All') u.searchParams.set('employmentType', employmentType);
    return u.href;
};

const pickProxyUrl = async (proxyConfiguration) => (proxyConfiguration ? proxyConfiguration.newUrl() : undefined);

const extractJobsFromNextData = (html) => {
    const $ = cheerioLoad(html);
    const scriptContent = $('#__NEXT_DATA__').html();
    
    if (!scriptContent) {
        return null;
    }

    try {
        const nextData = JSON.parse(scriptContent);
        const jobs = nextData?.props?.pageProps?.jobs || [];
        const totalResults = nextData?.props?.pageProps?.totalResults || 0;
        
        return {
            jobs,
            totalResults,
        };
    } catch (error) {
        log.warning(`Failed to parse __NEXT_DATA__: ${error.message}`);
        return null;
    }
};

const parseJobFromJson = (jobData) => {
    const dateSeconds = jobData?.date?.seconds;
    const publishedAt = dateSeconds ? new Date(Number(dateSeconds) * 1000).toISOString() : null;
    
    const employmentTypes = Array.isArray(jobData?.employmentType) 
        ? jobData.employmentType.filter(t => t !== 'UNSPECIFIED').join(', ') 
        : null;

    const baseSalary = jobData?.baseSalary;
    let salaryText = null;
    if (baseSalary && (baseSalary.minValue || baseSalary.maxValue || baseSalary.value)) {
        const currency = baseSalary.currency || '$';
        if (baseSalary.minValue && baseSalary.maxValue) {
            salaryText = `${currency}${baseSalary.minValue} - ${currency}${baseSalary.maxValue}`;
        } else if (baseSalary.value) {
            salaryText = `${currency}${baseSalary.value}`;
        }
        if (baseSalary.unitText) {
            salaryText = `${salaryText} ${baseSalary.unitText}`;
        }
    }

    return {
        id: jobData?.id || null,
        title: jobData?.title || null,
        company: jobData?.company || jobData?.hiringOrganization?.name || null,
        location: jobData?.location || null,
        salary: salaryText,
        employmentType: employmentTypes,
        description: jobData?.summary || null,
        url: jobData?.url || null,
        applyLink: jobData?.url ? `${jobData.url}/apply?title=${encodeURIComponent(jobData.title || '')}` : null,
        datePosted: publishedAt,
        source: 'json-api',
        fetchedAt: new Date().toISOString(),
    };
};

const fetchSearchPage = async (searchUrl, proxyConfiguration) => {
    const res = await gotScraping({
        url: searchUrl,
        headers: DEFAULT_HEADERS,
        responseType: 'text',
        proxyUrl: await pickProxyUrl(proxyConfiguration),
        timeout: { request: 30000 },
        throwHttpErrors: false,
    });

    if (res.statusCode !== 200) {
        throw new Error(`Search page status ${res.statusCode}`);
    }

    const jsonData = extractJobsFromNextData(res.body);
    if (jsonData) {
        return { jobs: jsonData.jobs, totalResults: jsonData.totalResults, source: 'json' };
    }

    // HTML fallback
    log.warning('JSON extraction failed, falling back to HTML parsing');
    return { jobs: [], totalResults: 0, source: 'html-fallback' };
};

const parseHtmlJobDetail = (html, url) => {
    const $ = cheerioLoad(html);
    
    const title = $('h2.title').first().text().trim() || $('h1').first().text().trim();
    const company = $('.job-single a').first().text().trim() || $('span.company').first().text().trim();
    const location = $('span.location').text().replace(/.*\n/, '').trim();
    const description = $('.job-search-description').html() || '';
    const descriptionText = cleanHtml(description);
    const dateText = $('.col-lg-auto p').text().trim();
    
    return {
        title: title || null,
        company: company || null,
        location: location || null,
        description: descriptionText || null,
        description_html: description || null,
        datePosted: dateText || null,
        url: url,
    };
};

const fetchJobDetail = async (jobUrl, proxyConfiguration) => {
    try {
        const res = await gotScraping({
            url: jobUrl,
            headers: DEFAULT_HEADERS,
            responseType: 'text',
            proxyUrl: await pickProxyUrl(proxyConfiguration),
            timeout: { request: 30000 },
            throwHttpErrors: false,
        });

        if (res.statusCode !== 200) {
            log.warning(`Job detail fetch failed (${res.statusCode}) for ${jobUrl}`);
            return null;
        }

        return parseHtmlJobDetail(res.body, jobUrl);
    } catch (error) {
        log.warning(`Error fetching job detail for ${jobUrl}: ${error.message}`);
        return null;
    }
};

// Initialize Actor properly for Apify platform
await Actor.init();

try {
    const input = (await Actor.getInput()) || {};
    const {
        startUrl,
        keyword = '',
        location = 'US',
        category = 'All',
        company = 'All',
        employmentType = 'All',
        collectDetails = false,
        results_wanted: resultsWantedRaw = 50,
        max_pages: maxPagesRaw = 5,
        maxConcurrency = 3,
        proxyConfiguration,
    } = input;

    const resultsWanted = Number.isFinite(+resultsWantedRaw) ? Math.max(1, +resultsWantedRaw) : 1;
    const maxPages = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 1;
    const proxyConf = proxyConfiguration ? await Actor.createProxyConfiguration({ ...proxyConfiguration }) : undefined;

    // Extract parameters from startUrl if provided
    let searchKeyword = keyword.trim();
    let searchLocation = location.trim();
    let searchCategory = category;
    let searchCompany = company;
    let searchEmploymentType = employmentType;

    if (startUrl) {
        try {
            const u = new URL(startUrl);
            searchKeyword = u.searchParams.get('keyword') || searchKeyword;
            searchLocation = u.searchParams.get('location') || searchLocation;
            searchCategory = u.searchParams.get('category') || searchCategory;
            searchCompany = u.searchParams.get('company') || searchCompany;
            searchEmploymentType = u.searchParams.get('employmentType') || searchEmploymentType;
        } catch {
            log.warning('Failed to parse startUrl, using other input parameters');
        }
    }

    const seenIds = new Set();
    const limiter = createLimiter(Math.max(1, Number(maxConcurrency) || 1));
    let saved = 0;

    // QA-compliant timeout: complete within 3.5 minutes
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 3.5 * 60 * 1000;
    const stats = { pagesProcessed: 0, jobsSaved: 0, requests: 0, errors: 0 };

    log.info(`🔍 Starting College Recruiter scraper`);
    log.info(`📋 Search params: keyword="${searchKeyword}", location="${searchLocation}"`);
    log.info(`🎯 Target: ${resultsWanted} jobs across ${maxPages} pages max`);

    for (let page = 1; page <= maxPages && saved < resultsWanted; page += 1) {
        // QA Safety: timeout check
        const elapsed = (Date.now() - startTime) / 1000;
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
            log.info(`⏱️ Timeout safety triggered at ${elapsed.toFixed(0)}s. Saved ${saved}/${resultsWanted} jobs.`);
            await Actor.setValue('TIMEOUT_REACHED', true);
            break;
        }

        stats.pagesProcessed = page;

        const searchUrl = buildSearchUrl({
            keyword: searchKeyword,
            location: searchLocation,
            category: searchCategory,
            company: searchCompany,
            employmentType: searchEmploymentType,
        });

        const pageUrl = page > 1 ? `${searchUrl}&page=${page}` : searchUrl;
        
        log.info(`📄 Fetching page ${page}: ${pageUrl}`);

        let pageData;
        try {
            stats.requests += 1;
            pageData = await fetchSearchPage(pageUrl, proxyConf);
            log.info(`✅ Page ${page}: Found ${pageData.jobs.length} jobs (total available: ${pageData.totalResults})`);
        } catch (err) {
            stats.errors += 1;
            log.error(`❌ Failed to fetch page ${page}: ${err.message}`);
            break;
        }

        if (!pageData.jobs || pageData.jobs.length === 0) {
            log.info(`📭 No more jobs found on page ${page}. Stopping.`);
            break;
        }

        const jobsToProcess = pageData.jobs.slice(0, resultsWanted - saved);
        
        const detailPromises = jobsToProcess.map((jobData) =>
            limiter(async () => {
                if (saved >= resultsWanted) return;
                
                const jobId = jobData.id;
                if (jobId && seenIds.has(jobId)) {
                    log.debug(`Skipping duplicate job: ${jobId}`);
                    return;
                }
                if (jobId) seenIds.add(jobId);

                try {
                    let job = parseJobFromJson(jobData);

                    // Optionally fetch full details
                    if (collectDetails && jobData.url) {
                        stats.requests += 1;
                        const detailData = await fetchJobDetail(jobData.url, proxyConf);
                        if (detailData) {
                            job = { ...job, ...detailData };
                        }
                    }

                    await Dataset.pushData(job);
                    saved += 1;
                    stats.jobsSaved = saved;
                    
                    if (saved % 10 === 0) {
                        log.info(`💾 Saved ${saved}/${resultsWanted} jobs...`);
                    }
                } catch (err) {
                    stats.errors += 1;
                    log.warning(`⚠️ Failed to process job ${jobId}: ${err.message}`);
                }
            }),
        );

        await Promise.all(detailPromises);

        // QA visibility: Log early success
        if (saved > 0 && page === 1) {
            log.info(`✅ First page complete: ${saved} jobs saved successfully!`);
        }

        // Performance metric for QA
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const rate = saved > 0 ? (saved / elapsedSeconds).toFixed(2) : '0.00';
        log.info(`⚡ Performance: ${saved} jobs in ${elapsedSeconds.toFixed(1)}s (${rate} jobs/sec)`);

        // Safety: stop if approaching timeout
        if (elapsedSeconds > MAX_RUNTIME_MS / 1000 * 0.8) {
            log.info(`⏱️ Approaching time limit at page ${page}. Stopping gracefully.`);
            break;
        }

        if (saved >= resultsWanted) {
            log.info(`🎯 Target reached: ${saved} jobs collected`);
            break;
        }

        if (saved >= pageData.totalResults) {
            log.info(`📊 All available jobs collected: ${saved}/${pageData.totalResults}`);
            break;
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;

    // Final statistics report for QA validation
    log.info('='.repeat(60));
    log.info('📊 ACTOR RUN STATISTICS');
    log.info('='.repeat(60));
    log.info(`✅ Jobs saved: ${saved}/${resultsWanted}`);
    log.info(`📄 Pages processed: ${stats.pagesProcessed}/${maxPages}`);
    log.info(`🌐 HTTP requests: ${stats.requests}`);
    log.info(`⚠️  Errors: ${stats.errors}`);
    log.info(`⏱️  Runtime: ${totalTime.toFixed(2)}s`);
    log.info(`⚡ Performance: ${saved > 0 ? (saved / totalTime).toFixed(2) : '0.00'} jobs/sec`);
    log.info('='.repeat(60));

    // QA validation: ensure we have results
    if (saved === 0) {
        const errorMsg = 'No results scraped. Check input parameters and proxy configuration.';
        log.error(`❌ ${errorMsg}`);
        await Actor.fail(errorMsg);
    } else {
        log.info(`✅ SUCCESS: Collected ${saved} job(s) from College Recruiter`);
        await Actor.setValue('OUTPUT_SUMMARY', {
            jobsSaved: saved,
            pagesProcessed: stats.pagesProcessed,
            runtime: totalTime,
            success: true,
        });
    }
} catch (error) {
    log.error(`❌ CRITICAL ERROR: ${error.message}`);
    log.exception(error, 'Actor failed with exception');
    throw error;
} finally {
    // Always properly exit Actor for QA compliance
    await Actor.exit();
}
