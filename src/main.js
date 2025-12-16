// College Recruiter Jobs Scraper - HTTP + JSON parse first, HTML fallback
import { Actor, log } from 'apify';
import { Dataset, gotScraping, PlaywrightCrawler } from 'crawlee';
import { load as cheerioLoad } from 'cheerio';

const SEARCH_PAGE_BASE = 'https://www.collegerecruiter.com/job-search';
const NEXT_DATA_ENDPOINT = 'https://www.collegerecruiter.com/_next/data';
const HEADER_GENERATOR_OPTIONS = {
    browsers: [
        { name: 'chrome', minVersion: 110, maxVersion: 131 },
    ],
    devices: ['desktop'],
    operatingSystems: ['windows', 'linux'],
};
const REQUEST_TIMEOUT_MS = 35000;
const PLAYWRIGHT_TIMEOUT_SECS = 45;

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

const requestWithRetries = async (label, handler, { maxRetries = 3, startDelayMs = 1000, stats } = {}) => {
    let attempt = 0;
    let lastError;
    while (attempt < maxRetries) {
        attempt += 1;
        try {
            if (stats) stats.requests += 1;
            return await handler(attempt);
        } catch (error) {
            lastError = error;
            if (attempt >= maxRetries) break;
            const waitTime = Math.round(startDelayMs * (1.5 ** (attempt - 1)) + Math.random() * 250);
            log.warning(`${label} attempt ${attempt}/${maxRetries} failed: ${error.message}. Retrying in ${waitTime} ms.`);
            await Actor.sleep(waitTime);
        }
    }
    throw lastError;
};

const buildSearchParams = ({ keyword, location, category, company, employmentType }, page) => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (location) params.set('location', location);
    if (category && category !== 'All') params.set('category', category);
    if (company && company !== 'All') params.set('company', company);
    if (employmentType && employmentType !== 'All') params.set('employmentType', employmentType);
    if (page && page > 1) params.set('page', String(page));
    return params;
};

const buildSearchUrl = (search, page) => {
    const params = buildSearchParams(search, page);
    const u = new URL(SEARCH_PAGE_BASE);
    for (const [key, value] of params.entries()) {
        u.searchParams.set(key, value);
    }
    return u.href;
};

const createProxyUrlPicker = (proxyConfiguration) => {
    if (!proxyConfiguration) return async () => undefined;
    const prefix = `collegerecruiter_${Date.now()}`;
    return async (label = 'search') => proxyConfiguration.newUrl({ sessionId: `${prefix}_${label}` });
};

const createRequestHelper = (proxyConfiguration) => {
    const pickProxyUrl = createProxyUrlPicker(proxyConfiguration);
    return {
        call: async ({ url, session = 'search', responseType = 'text', ...overrides }) => {
            const proxyUrl = await pickProxyUrl(session);
            return gotScraping({
                url,
                responseType,
                proxyUrl,
                useHeaderGenerator: true,
                headerGeneratorOptions: HEADER_GENERATOR_OPTIONS,
                timeout: { request: REQUEST_TIMEOUT_MS },
                throwHttpErrors: false,
                http2: true,
                decompress: true,
                ...overrides,
            });
        },
    };
};

const normalizeNextDataPayload = (payload) => {
    if (!payload) return null;
    const pageProps = payload.pageProps ?? payload.props?.pageProps;
    if (!pageProps) return null;
    return {
        jobs: pageProps.jobs ?? [],
        totalResults: pageProps.totalResults ?? 0,
        facets: pageProps.facets ?? [],
        query: pageProps.query ?? payload.query ?? null,
        buildId: payload.buildId ?? null,
    };
};

const parseNextDataFromHtml = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    const scriptContent = $('#__NEXT_DATA__').text();

    if (!scriptContent) {
        return null;
    }

    try {
        const payload = JSON.parse(scriptContent);
        const normalized = normalizeNextDataPayload(payload);
        if (!normalized) return null;
        return { ...normalized, buildId: payload.buildId ?? normalized.buildId };
    } catch (error) {
        log.warning(`Failed to parse __NEXT_DATA__: ${error.message}`);
        return null;
    }
};

const parseJobsFromHtmlList = (html) => {
    if (!html) return { jobs: [], totalResults: 0 };
    const $ = cheerioLoad(html);
    const jobs = [];
    const seen = new Set();
    $('.results-list button[data-job-id]').each((_, el) => {
        const $el = $(el);
        const jobId = $el.attr('data-job-id')?.trim();
        if (jobId && seen.has(jobId)) return;
        if (jobId) seen.add(jobId);
        const jobUrl = $el.attr('data-job-url')?.trim();
        const title = $el.find('.title').text().trim();
        const company = $el.find('.company').text().trim();
        const summaryHtml = $el.find('.summary').html() || '';
        const summary = cleanHtml(summaryHtml);
        const location = $el.find('.location').text().replace(/\s+/g, ' ').trim();
        const postedText = $el.find('.text-gray small').first().text().replace('Posted', '').trim();
        jobs.push({
            id: jobId || jobUrl || null,
            title: title || null,
            company: company || null,
            summary: summary || null,
            location: location || null,
            url: jobUrl || null,
            datePosted: postedText || null,
            employmentTypeText: null,
            source: 'html-list',
        });
    });
    const totalText = $('.results-high').first().text().replace(/[^\d]/g, '');
    const totalResults = totalText ? Number(totalText) : jobs.length;
    return { jobs, totalResults, source: 'html-list' };
};

const fetchWithPlaywright = async (url, proxyConfiguration) => {
    let result = { html: null, nextData: null };
    const crawler = new PlaywrightCrawler({
        proxyConfiguration,
        maxRequestsPerCrawl: 1,
        navigationTimeoutSecs: PLAYWRIGHT_TIMEOUT_SECS,
        requestHandlerTimeoutSecs: PLAYWRIGHT_TIMEOUT_SECS + 15,
        requestHandler: async ({ page }) => {
            await page.waitForLoadState('networkidle', { timeout: PLAYWRIGHT_TIMEOUT_SECS * 1000 }).catch(() => {});
            result.html = await page.content();
            try {
                result.nextData = await page.evaluate(() => window.__NEXT_DATA__ ?? null);
            } catch {
                result.nextData = null;
            }
        },
    });

    await crawler.run([url]);
    return result;
};

const parseJobFromJson = (jobData, source = 'json-api') => {
    const dateSeconds = jobData?.date?.seconds;
    const publishedAt = dateSeconds ? new Date(Number(dateSeconds) * 1000).toISOString() : jobData?.datePosted ?? null;

    const employmentTypes = Array.isArray(jobData?.employmentType)
        ? jobData.employmentType.filter((t) => t && t !== 'UNSPECIFIED').join(', ')
        : jobData?.employmentTypeText ?? null;

    const baseSalary = jobData?.baseSalary;
    let salaryText = null;
    if (baseSalary && (baseSalary.minValue || baseSalary.maxValue || baseSalary.value)) {
        const currency = baseSalary.currency || '$';
        if (baseSalary.minValue && baseSalary.maxValue) {
            salaryText = `${currency}${baseSalary.minValue} - ${currency}${baseSalary.maxValue}`;
        } else if (baseSalary.value) {
            salaryText = `${currency}${baseSalary.value}`;
        }
        if (salaryText && baseSalary.unitText) {
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
        description: jobData?.summary ? cleanHtml(jobData.summary) : jobData?.summary || null,
        url: jobData?.url || null,
        applyLink: jobData?.url ? `${jobData.url}/apply?title=${encodeURIComponent(jobData.title || '')}` : null,
        datePosted: publishedAt,
        rawDateText: jobData?.datePosted ?? null,
        source,
        fetchedAt: new Date().toISOString(),
    };
};

const fetchSearchPage = async ({
    search,
    page,
    request,
    proxyConfiguration,
    searchState,
    stats,
}) => {
    const params = buildSearchParams(search, page);
    const searchUrl = `${SEARCH_PAGE_BASE}?${params.toString()}`;

    if (searchState.buildId) {
        try {
            const nextDataUrl = `${NEXT_DATA_ENDPOINT}/${searchState.buildId}/job-search.json?${params.toString()}`;
            const res = await requestWithRetries(
                'JSON API request',
                () =>
                    request({
                        url: nextDataUrl,
                        responseType: 'json',
                        session: 'search-json',
                    }),
                { maxRetries: 2, stats },
            );
            if (res.statusCode === 200 && res.body) {
                const normalized = normalizeNextDataPayload(res.body);
                if (normalized?.jobs?.length) {
                    return { ...normalized, source: 'json-api', url: searchUrl };
                }
            } else if (res.statusCode === 404) {
                searchState.buildId = null;
            } else if (res.statusCode && res.statusCode >= 400) {
                log.warning(`JSON API responded with status ${res.statusCode}`);
            }
        } catch (error) {
            log.warning(`JSON API lookup failed: ${error.message}`);
            searchState.buildId = null;
        }
    }

    let htmlBody = null;
    try {
        const res = await requestWithRetries(
            'Search HTML request',
            () =>
                request({
                    url: searchUrl,
                    responseType: 'text',
                    session: 'search-html',
                }),
            { maxRetries: 2, stats },
        );
        if (res.statusCode === 200) {
            htmlBody = res.body;
            const parsedNextData = parseNextDataFromHtml(htmlBody);
            if (parsedNextData?.buildId) {
                searchState.buildId = parsedNextData.buildId;
            }
            if (parsedNextData?.jobs?.length) {
                return { ...parsedNextData, source: 'hydrated-html', url: searchUrl };
            }
            const htmlJobs = parseJobsFromHtmlList(htmlBody);
            if (htmlJobs.jobs.length) {
                return { ...htmlJobs, url: searchUrl };
            }
        } else {
            log.warning(`Search HTML request returned status ${res.statusCode}`);
        }
    } catch (error) {
        log.warning(`Search HTML request failed: ${error.message}`);
    }

    log.info('Switching to Playwright fallback for search page.');
    stats.playwrightRuns = (stats.playwrightRuns || 0) + 1;
    stats.requests += 1;
    const playwrightResult = await fetchWithPlaywright(searchUrl, proxyConfiguration);
    if (playwrightResult?.nextData) {
        const normalized = normalizeNextDataPayload(playwrightResult.nextData);
        if (normalized?.jobs?.length) {
            if (playwrightResult.nextData.buildId) searchState.buildId = playwrightResult.nextData.buildId;
            searchState.playwrightUsed = true;
            return { ...normalized, source: 'playwright-json', url: searchUrl };
        }
    }
    if (playwrightResult?.html) {
        const htmlJobs = parseJobsFromHtmlList(playwrightResult.html);
        if (htmlJobs.jobs.length) {
            searchState.playwrightUsed = true;
            return { ...htmlJobs, source: 'playwright-html', url: searchUrl };
        }
    }

    throw new Error('Unable to extract jobs from search page.');
};

const parseHtmlJobDetail = (html, url) => {
    if (!html) return null;
    const $ = cheerioLoad(html);

    const title = $('h1, h2.title').first().text().trim();
    const company = $('.job-single a, span.company').first().text().trim();
    const location = $('span.location, .job-location').first().text().replace(/\s+/g, ' ').trim();
    const descriptionHtml = $('.job-search-description').html() || $('#job-description').html() || '';
    const descriptionText = cleanHtml(descriptionHtml);
    const dateText = $('time').first().attr('datetime') || $('.text-gray small').first().text().trim();

    return {
        title: title || null,
        company: company || null,
        location: location || null,
        description: descriptionText || null,
        description_html: descriptionHtml || null,
        datePosted: dateText || null,
        url,
    };
};

const extractJobPostingFromJsonLd = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    let jobData = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).contents().text();
        try {
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of items) {
                const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
                if (types && types.includes('JobPosting')) {
                    jobData = item;
                    return false;
                }
            }
        } catch {
            // ignore malformed block
        }
        return undefined;
    });
    if (!jobData) return null;
    const salaryValue = jobData.baseSalary?.value;
    let salaryText = null;
    if (salaryValue) {
        const { currency, minValue, maxValue, unitText, value } = salaryValue;
        const prefix = currency ? `${currency} ` : '';
        if (minValue && maxValue) {
            salaryText = `${prefix}${minValue} - ${prefix}${maxValue}`;
        } else if (value) {
            salaryText = `${prefix}${value}`;
        }
        if (salaryText && unitText) salaryText = `${salaryText} ${unitText}`;
    }
    const employmentType = Array.isArray(jobData.employmentType)
        ? jobData.employmentType.join(', ')
        : jobData.employmentType ?? null;

    return {
        title: jobData.title ?? null,
        company: jobData.hiringOrganization?.name ?? null,
        location:
            jobData.jobLocation?.address?.addressLocality
                ? [
                      jobData.jobLocation.address.addressLocality,
                      jobData.jobLocation.address.addressRegion,
                      jobData.jobLocation.address.addressCountry,
                  ]
                      .filter(Boolean)
                      .join(', ')
                : jobData.jobLocation?.address?.addressLocality ?? null,
        datePosted: jobData.datePosted ?? jobData.datePublished ?? null,
        validThrough: jobData.validThrough ?? null,
        salary: salaryText,
        employmentType,
        description_html: jobData.description ?? null,
        description: cleanHtml(jobData.description) ?? null,
    };
};

const mergeJobDetails = (base, addition) => {
    if (!addition) return base;
    const merged = { ...base };
    for (const [key, value] of Object.entries(addition)) {
        if (value === undefined || value === null) continue;
        if (!merged[key]) merged[key] = value;
    }
    return merged;
};

const fetchJobDetail = async ({ jobUrl, request, stats }) => {
    if (!jobUrl) return null;
    try {
        const res = await requestWithRetries(
            'Job detail request',
            () =>
                request({
                    url: jobUrl,
                    responseType: 'text',
                    session: 'detail',
                }),
            { maxRetries: 2, stats },
        );
        if (res.statusCode !== 200) {
            throw new Error(`Status ${res.statusCode}`);
        }
        const html = res.body;
        let jobDetail = parseHtmlJobDetail(html, jobUrl) || {};
        jobDetail = mergeJobDetails(jobDetail, extractJobPostingFromJsonLd(html));
        return jobDetail;
    } catch (error) {
        log.warning(`Job detail fetch failed for ${jobUrl}: ${error.message}`);
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
    const proxyConf = await Actor.createProxyConfiguration(proxyConfiguration ?? { useApifyProxy: true });
    const { call: request } = createRequestHelper(proxyConf);

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

    const startTime = Date.now();
    const MAX_RUNTIME_MS = 3.5 * 60 * 1000;
    const stats = { pagesProcessed: 0, jobsSaved: 0, requests: 0, errors: 0, playwrightRuns: 0 };
    const searchState = { buildId: null, playwrightUsed: false };

    log.info('Starting College Recruiter scraper');
    log.info(`Search params: keyword="${searchKeyword}", location="${searchLocation}"`);
    log.info(`Target: ${resultsWanted} jobs across ${maxPages} pages max`);

    for (let page = 1; page <= maxPages && saved < resultsWanted; page += 1) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            log.info(`Timeout safety triggered at ${elapsed}s. Saved ${saved}/${resultsWanted} jobs.`);
            await Actor.setValue('TIMEOUT_REACHED', true);
            break;
        }

        stats.pagesProcessed = page;

        const searchConfig = {
            keyword: searchKeyword,
            location: searchLocation,
            category: searchCategory,
            company: searchCompany,
            employmentType: searchEmploymentType,
        };

        const pageUrl = buildSearchUrl(searchConfig, page);
        log.info(`Fetching page ${page}: ${pageUrl}`);

        let pageData;
        try {
            pageData = await fetchSearchPage({
                search: searchConfig,
                page,
                request,
                proxyConfiguration: proxyConf,
                searchState,
                stats,
            });
            log.info(`Page ${page}: Found ${pageData.jobs.length} jobs (strategy: ${pageData.source})`);
        } catch (err) {
            stats.errors += 1;
            log.error(`Failed to fetch page ${page}: ${err.message}`);
            break;
        }

        if (!pageData.jobs || pageData.jobs.length === 0) {
            log.info(`No more jobs returned on page ${page}. Stopping.`);
            break;
        }

        const jobsToProcess = pageData.jobs.slice(0, resultsWanted - saved);

        const detailPromises = jobsToProcess.map((jobData) =>
            limiter(async () => {
                if (saved >= resultsWanted) return;

                const jobId = jobData.id;
                if (jobId && seenIds.has(jobId)) {
                    log.debug(`Skipping duplicate job ${jobId}`);
                    return;
                }
                if (jobId) seenIds.add(jobId);

                try {
                    let job = parseJobFromJson(jobData, pageData.source);

                    if (collectDetails && job.url) {
                        const detailData = await fetchJobDetail({ jobUrl: job.url, request, stats });
                        if (detailData) {
                            job = { ...job, ...detailData };
                        }
                    }

                    await Dataset.pushData(job);
                    saved += 1;
                    stats.jobsSaved = saved;

                    if (saved % 10 === 0) {
                        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
                        log.info(`Progress: ${saved}/${resultsWanted} jobs saved (${elapsedSeconds}s elapsed)`);
                    }
                } catch (err) {
                    stats.errors += 1;
                    log.warning(`Failed to process job ${jobId}: ${err.message}`);
                }
            }),
        );

        await Promise.all(detailPromises);

        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const rate = saved > 0 ? (saved / elapsedSeconds).toFixed(2) : '0.00';
        log.info(`Performance: ${saved} jobs in ${elapsedSeconds.toFixed(1)}s (${rate} jobs/sec)`);

        if (saved >= resultsWanted) {
            log.info(`Target reached: ${saved} jobs collected.`);
            break;
        }

        if (saved >= pageData.totalResults) {
            log.info(`All available jobs collected: ${saved}/${pageData.totalResults}`);
            break;
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;

    log.info('='.repeat(60));
    log.info('ACTOR RUN STATISTICS');
    log.info('='.repeat(60));
    log.info(`Jobs saved: ${saved}/${resultsWanted}`);
    log.info(`Pages processed: ${stats.pagesProcessed}/${maxPages}`);
    log.info(`HTTP requests (incl. retries): ${stats.requests}`);
    if (stats.playwrightRuns) {
        log.info(`Playwright fallbacks: ${stats.playwrightRuns}`);
    }
    log.info(`Errors: ${stats.errors}`);
    log.info(`Runtime: ${totalTime.toFixed(2)}s`);
    log.info(`Performance: ${saved > 0 ? (saved / totalTime).toFixed(2) : '0.00'} jobs/sec`);
    log.info('='.repeat(60));

    if (saved === 0) {
        const errorMsg = 'No results scraped. Check input parameters and proxy configuration.';
        log.error(errorMsg);
        await Actor.fail(errorMsg);
    } else {
        log.info(`SUCCESS: Collected ${saved} job(s) from College Recruiter`);
        await Actor.setValue('OUTPUT_SUMMARY', {
            jobsSaved: saved,
            pagesProcessed: stats.pagesProcessed,
            runtime: totalTime,
            success: true,
            usedPlaywright: searchState.playwrightUsed,
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
