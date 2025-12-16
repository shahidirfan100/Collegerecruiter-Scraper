// College Recruiter Jobs Scraper - HTTP + JSON parse first, HTML fallback
import { Actor, log } from 'apify';
import { Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { load as cheerioLoad } from 'cheerio';
import { chromium } from 'playwright';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomDelay = () => sleep(500 + Math.random() * 1500);


const SEARCH_PAGE_BASE = 'https://www.collegerecruiter.com/job-search';
const NEXT_DATA_ENDPOINT = 'https://www.collegerecruiter.com/_next/data';
const HEADER_GENERATOR_OPTIONS = {
    browsers: [
        { name: 'chrome', minVersion: 110, maxVersion: 131 },
    ],
    devices: ['desktop'],
    operatingSystems: ['windows', 'linux'],
    httpVersion: '2',
};
const REQUEST_TIMEOUT_MS = 35000;

const EMPLOYMENT_TYPES = {
    'full time': 'Full time',
    'part time': 'Part time',
    'contractor': 'Contractor',
    'contract to hire': 'Contract to hire',
    'temporary': 'Temporary',
    'intern': 'Internship',
};
const EMPLOYMENT_ENUM = {
    'full time': 'FULL_TIME',
    'part time': 'PART_TIME',
    'contractor': 'CONTRACTOR',
    'contract to hire': 'CONTRACT_TO_HIRE',
    'temporary': 'TEMPORARY',
    'intern': 'INTERN',
    'internship': 'INTERN',
};



const cleanHtml = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    $('script, style, noscript').remove();
    return $.root().text().replace(/\s+/g, ' ').trim();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeEmploymentType = (value) => {
    if (!value || value === 'All') return null;
    const key = value.trim().toLowerCase();
    if (EMPLOYMENT_ENUM[key]) return EMPLOYMENT_ENUM[key];
    if (/^[A-Z_]+$/.test(value.trim())) return value.trim();
    return value.trim().replace(/\s+/g, '_').toUpperCase();
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
            await sleep(waitTime);
        }
    }
    throw lastError;
};

const buildSearchParams = ({ keyword, location, employmentType }, page) => {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (location) params.set('location', location);
    const employmentParam = normalizeEmploymentType(employmentType);
    if (employmentParam) params.set('employmentType', employmentParam);
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
    return async (label = 'search') => {
        const labelText = typeof label === 'string' ? label : 'generic';
        const rawSession = `${prefix}_${labelText}`;
        const sessionId = rawSession
            .replace(/[^\w._~]/g, '_')
            .slice(0, 50);
        return proxyConfiguration.newUrl(sessionId);
    };
};

const createRequestHelper = (proxyConfiguration) => {
    const pickProxyUrl = createProxyUrlPicker(proxyConfiguration);
    return {
        call: async ({ url, session = 'search', responseType = 'text', ...overrides }) => {
            const proxyUrl = await pickProxyUrl(session);
            // Add random delay for stealth
            await randomDelay();

            return gotScraping({
                url,
                responseType,
                proxyUrl,
                useHeaderGenerator: true,
                headerGeneratorOptions: HEADER_GENERATOR_OPTIONS,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.collegerecruiter.com/',
                    'Cache-Control': 'no-cache',
                },
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

const toPlaywrightProxy = (proxyUrl) => {
    if (!proxyUrl) return undefined;
    const u = new URL(proxyUrl);
    const server = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    return { server, username, password };
};

const createPlaywrightSession = async (proxyConfiguration) => {
    const pickProxyUrl = createProxyUrlPicker(proxyConfiguration);
    const proxyUrl = await pickProxyUrl('playwright');
    const proxy = toPlaywrightProxy(proxyUrl);

    const browser = await chromium.launch({
        headless: true,
        proxy,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1366, height: 768 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    await context.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
            await route.abort();
            return;
        }
        await route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    const fetchNextData = async (url) => {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        const status = response?.status();
        if (status && status >= 400) {
            throw new Error(`Playwright navigation status ${status}`);
        }

        // The script tag is usually not visible; wait for it to be attached and try to read it.
        let jsonText = null;
        try {
            await page.waitForSelector('#__NEXT_DATA__', { state: 'attached', timeout: 15000 });
            jsonText = await page.$eval('#__NEXT_DATA__', (el) => el.textContent || '');
        } catch (err) {
            log.warning(`__NEXT_DATA__ selector issues: ${err.message}. Trying fallback to HTML content.`);
            const html = await page.content();
            const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
            if (match) jsonText = match[1];
        }

        // If still missing, attempt a reload and wait for network idle to allow client hydration
        if (!jsonText) {
            try {
                await page.reload({ waitUntil: 'networkidle' });
                await page.waitForTimeout(1000);
                const html2 = await page.content();
                const match2 = html2.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
                if (match2) jsonText = match2[1];
            } catch (err) {
                log.warning(`Playwright reload fallback failed: ${err.message}`);
            }
        }

        if (!jsonText) throw new Error('Missing __NEXT_DATA__');

        try {
            return JSON.parse(jsonText);
        } catch (err) {
            throw new Error(`Failed to parse __NEXT_DATA__: ${err.message}`);
        }
    };

    return {
        fetchNextData,
        close: async () => {
            await context.close().catch(() => { });
            await browser.close().catch(() => { });
        },
    };
};

const parseJobFromJson = (jobData, source = 'json-api') => {
    const dateSeconds = jobData?.date?.seconds;
    const publishedAt = dateSeconds ? new Date(Number(dateSeconds) * 1000).toISOString() : jobData?.datePosted ?? null;

    let employmentTypes = null;
    if (Array.isArray(jobData?.employmentType)) {
        employmentTypes = jobData.employmentType.filter((t) => t && t !== 'UNSPECIFIED').join(', ');
    } else if (typeof jobData?.employmentType === 'string') {
        employmentTypes = jobData.employmentType;
    } else {
        employmentTypes = jobData?.employmentTypeText ?? null;
    }

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

const fetchSearchPage = async ({ search, page, request, searchState, stats, proxyConfiguration }) => {
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
    let lastStatus = null;
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
        lastStatus = res.statusCode;
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

    // Playwright fallback for heavy blocking (e.g., 403)
    log.info(`Checking fallback condition: status=${lastStatus}, htmlBody=${!!htmlBody}`);
    if (lastStatus === 403 || !htmlBody) {
        log.info('Attempting Playwright fallback due to blocking or missing HTML data');
        let pw = null;
        try {
            if (!proxyConfiguration) log.warning('Proxy configuration missing for Playwright fallback');
            pw = await createPlaywrightSession(proxyConfiguration);
            const payload = await pw.fetchNextData(searchUrl);
            const normalized = normalizeNextDataPayload(payload);
            if (normalized?.jobs?.length) {
                return { ...normalized, source: 'playwright-json', url: searchUrl };
            }
        } catch (err) {
            log.warning(`Playwright fallback failed: ${err.message}`);
        } finally {
            if (pw && pw.close) await pw.close();
        }
    }

    throw new Error('Unable to extract jobs from search page.');
};

const parseNextDataFromHtml = (html) => {
    if (!html) return null;
    const $ = cheerioLoad(html);
    const nextDataScript = $('#__NEXT_DATA__').html();
    if (!nextDataScript) return null;

    try {
        const data = JSON.parse(nextDataScript);
        return normalizeNextDataPayload(data);
    } catch (error) {
        log.warning(`Failed to parse __NEXT_DATA__: ${error.message}`);
        return null;
    }
};

const parseJobsFromHtmlList = (html) => {
    if (!html) return { jobs: [], totalResults: 0, source: 'html-parse' };
    const $ = cheerioLoad(html);

    const jobs = [];
    // Try multiple selectors to find job cards
    $('article, .job-card, .job-listing, [data-job-id]').each((_, el) => {
        const $el = $(el);

        // Extract title from various possible selectors
        const title = $el.find('h2, h3, .job-title, [class*="title"]').first().text().trim();
        if (!title) return; // Skip if no title

        // Extract company
        const company = $el.find('.company, .company-name, [class*="company"]').first().text().trim();

        // Extract location
        const location = $el.find('.location, .job-location, [class*="location"]').first().text().trim();

        // Extract employment type
        const employmentType = $el.find('.employment-type, .job-type, [class*="type"]').first().text().trim() || null;

        // Extract URL - look for the main link
        let url = $el.find('a[href*="/job/"]').first().attr('href');
        if (!url) url = $el.find('a').first().attr('href');
        if (!url) return; // Skip if no URL

        // Extract job ID from URL or data attribute
        const id = $el.attr('data-job-id') || url?.match(/\/job\/(\d+)/)?.[1] || null;

        // Build full URL if relative
        const fullUrl = url.startsWith('http') ? url : `https://www.collegerecruiter.com${url}`;

        jobs.push({
            id: id || fullUrl,
            title,
            company: company || null,
            location: location || null,
            employmentType,
            url: fullUrl,
            date: { seconds: Date.now() / 1000 },
        });
    });

    return { jobs, totalResults: jobs.length, source: 'html-parse' };
};;

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
        // log.warning(`Job detail fetch failed for ${jobUrl}: ${error.message}`);
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
        employmentType = 'All',
        collectDetails = false,
        results_wanted: resultsWantedRaw = 50,
        max_pages: maxPagesRaw = 5,
        maxConcurrency = 5,
        proxyConfiguration,
    } = input;

    const resultsWanted = Number.isFinite(+resultsWantedRaw) ? Math.max(1, +resultsWantedRaw) : 1;
    const maxPages = Number.isFinite(+maxPagesRaw) ? Math.max(1, +maxPagesRaw) : 1;
    const proxyConf = await Actor.createProxyConfiguration(proxyConfiguration ?? { useApifyProxy: true });
    const { call: request } = createRequestHelper(proxyConf);

    // Extract parameters from startUrl if provided
    let searchKeyword = keyword.trim();
    let searchLocation = location.trim();
    let searchEmploymentType = employmentType;

    if (startUrl) {
        try {
            const u = new URL(startUrl);
            searchKeyword = u.searchParams.get('keyword') || searchKeyword;
            searchLocation = u.searchParams.get('location') || searchLocation;
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
    const stats = { pagesProcessed: 0, jobsSaved: 0, requests: 0, errors: 0 };
    const searchState = { buildId: null };

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
                searchState,
                stats,
                proxyConfiguration: proxyConf,
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

                    // Detail fetching disabled per user request to avoid 403 blocks and improve speed
                    /*
                    if (collectDetails && job.url) {
                        const detailData = await fetchJobDetail({ jobUrl: job.url, request, stats });
                        if (detailData) {
                            job = { ...job, ...detailData };
                        }
                    }
                    */

                    await Dataset.pushData(job);
                    saved += 1;
                    stats.jobsSaved = saved;

                    if (saved % 10 === 0) {
                        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
                        log.info(`Progress: ${saved}/${resultsWanted} jobs saved (${elapsedSeconds}s elapsed)`);
                    }
                } catch (err) {
                    stats.errors += 1;
                    // log.warning(`Failed to process job ${jobId}: ${err.message}`);
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
