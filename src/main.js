// College Recruiter Jobs Scraper - HTTP + JSON parse first, HTML fallback
import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { load as cheerioLoad } from 'cheerio';
import { firefox } from 'playwright';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.7; rv:147.0) Gecko/20100101 Firefox/147.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0',
];
const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomDelay = () => sleep(500 + Math.random() * 1500);


const SEARCH_PAGE_BASE = 'https://www.collegerecruiter.com/job-search';
const INTERNAL_API_BASE = 'https://app.collegerecruiter.com';
const INTERNAL_SEARCH_ENDPOINT = `${INTERNAL_API_BASE}/job/search`;
const INTERNAL_JOB_ENDPOINT = `${INTERNAL_API_BASE}/job`;
const NEXT_DATA_ENDPOINT = 'https://www.collegerecruiter.com/_next/data';
const JOB_SITEMAP_INDEX_URL = 'https://www.collegerecruiter.com/sitemap/sitemap.xml';
const MIN_URLS_PER_SITEMAP_SCAN = 500;
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

const parseJsonSafely = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

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

const buildInternalApiSearchUrl = (search, page) => {
    const params = buildSearchParams(search, page);
    return `${INTERNAL_SEARCH_ENDPOINT}?${params.toString()}`;
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
            const { headers: overrideHeaders = {}, ...restOverrides } = overrides;
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
                    ...overrideHeaders,
                },
                timeout: { request: REQUEST_TIMEOUT_MS },
                throwHttpErrors: false,
                http2: true,
                decompress: true,
                ...restOverrides,
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
        requiresVerification: Boolean(pageProps.requiresVerification),
        expiresAt: pageProps.expiresAt ?? null,
    };
};

const normalizeInternalSearchPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return null;
    const body = payload.data && typeof payload.data === 'object' ? payload.data : payload;

    const rawJobs =
        body.jobs
        ?? body.results
        ?? body.items
        ?? payload.jobs
        ?? payload.results
        ?? payload.items
        ?? [];

    const jobs = Array.isArray(rawJobs)
        ? rawJobs
            .map((item) => {
                if (item && typeof item === 'object' && item.data && typeof item.data === 'object') {
                    return {
                        ...item.data,
                        status: item.status ?? item.data.status ?? null,
                    };
                }
                return item;
            })
            .filter((item) => item && item.deletedAt == null)
        : [];

    const totalResults =
        body.totalResults
        ?? body.total
        ?? body.count
        ?? payload.totalResults
        ?? payload.total
        ?? payload.count
        ?? jobs.length;

    return {
        jobs,
        totalResults: Number(totalResults) || 0,
        facets: body.facets ?? payload.facets ?? [],
        query: body.query ?? payload.query ?? null,
        requiresVerification: Boolean(body.requiresVerification ?? payload.requiresVerification),
        expiresAt: body.expiresAt ?? payload.expiresAt ?? null,
    };
};

const parseSitemapIndexUrls = (xml) => {
    if (!xml) return [];
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.collegerecruiter\.com\/sitemap\/sitemap_jobs_\d+\.xml)<\/loc>/g)];
    const urls = matches.map((match) => match[1]);
    return urls.sort((a, b) => {
        const aNum = Number(a.match(/sitemap_jobs_(\d+)\.xml$/)?.[1] ?? 0);
        const bNum = Number(b.match(/sitemap_jobs_(\d+)\.xml$/)?.[1] ?? 0);
        return bNum - aNum;
    });
};

const parseJobUrlsFromSitemap = (xml) => {
    if (!xml) return [];
    const matches = [...xml.matchAll(/<loc>(https:\/\/www\.collegerecruiter\.com\/job\/[^<]+)<\/loc>/g)];
    return matches.map((match) => match[1]);
};

const extractJobIdFromUrl = (jobUrl) => jobUrl?.match(/\/job\/(\d+)/)?.[1] ?? null;

const extractLocationFromApiJob = (jobData) => {
    const primaryLocation = jobData?.jobLocation ?? jobData?.applicantLocationRequirements;
    if (primaryLocation && typeof primaryLocation === 'object') {
        const parts = [
            primaryLocation.addressLocality,
            primaryLocation.addressRegion,
            primaryLocation.addressCountry,
        ].filter(Boolean);
        if (parts.length) return parts.join(', ');
    }
    return jobData?.location ?? null;
};

const buildSalaryText = (salaryData) => {
    if (!salaryData) return null;
    if (!(salaryData.minValue || salaryData.maxValue || salaryData.value)) return null;
    const currency = salaryData.currency || '$';
    let salaryText = null;
    if (salaryData.minValue && salaryData.maxValue) {
        salaryText = `${currency}${salaryData.minValue} - ${currency}${salaryData.maxValue}`;
    } else if (salaryData.value) {
        salaryText = `${currency}${salaryData.value}`;
    } else if (salaryData.minValue) {
        salaryText = `${currency}${salaryData.minValue}`;
    } else if (salaryData.maxValue) {
        salaryText = `${currency}${salaryData.maxValue}`;
    }
    if (salaryText && salaryData.unitText) salaryText = `${salaryText} ${salaryData.unitText}`;
    return salaryText;
};

const mapApiJobToOutput = (jobData, jobUrl) => {
    const employmentTypes = Array.isArray(jobData?.employmentType)
        ? jobData.employmentType.filter((type) => type && type !== 'UNSPECIFIED').join(', ')
        : (jobData?.employmentType ?? null);

    const location = extractLocationFromApiJob(jobData);
    const company = jobData?.hiringOrganization?.name ?? jobData?.company ?? null;
    const description = cleanHtml(jobData?.description ?? null);
    const salary = buildSalaryText(jobData?.baseSalary) ?? buildSalaryText(jobData?.estimatedSalary);
    const url = jobUrl || (jobData?.id ? `https://www.collegerecruiter.com/job/${jobData.id}` : null);

    return {
        id: jobData?.id ?? null,
        externalId: jobData?.exid ?? null,
        status: jobData?.apiStatus ?? jobData?.status ?? null,
        title: jobData?.title ?? null,
        company,
        location,
        city: jobData?.jobLocation?.addressLocality ?? null,
        region: jobData?.jobLocation?.addressRegion ?? null,
        country: jobData?.jobLocation?.addressCountry ?? null,
        postalCode: jobData?.jobLocation?.postalCode ?? null,
        streetAddress: jobData?.jobLocation?.streetAddress ?? null,
        isRemote: Boolean(jobData?.applicantLocationRequirements?.remote),
        industry: Array.isArray(jobData?.industry) ? jobData.industry.join(', ') : (jobData?.industry ?? null),
        salary,
        employmentType: employmentTypes,
        description: description || null,
        descriptionHtml: jobData?.description ?? null,
        url,
        applyLink: url ? `${url}/apply?title=${encodeURIComponent(jobData?.title ?? '')}` : null,
        datePosted: jobData?.datePosted ?? null,
        validThrough: jobData?.validThrough ?? null,
        rawDateText: jobData?.datePosted ?? null,
        hiringOrganization: jobData?.hiringOrganization ?? null,
        jobLocation: jobData?.jobLocation ?? null,
        applicantLocationRequirements: jobData?.applicantLocationRequirements ?? null,
        baseSalaryData: jobData?.baseSalary ?? null,
        estimatedSalaryData: jobData?.estimatedSalary ?? null,
        applicationInfo: jobData?.applicationInfo ?? null,
        video: jobData?.video ?? null,
        structuredData: jobData?.structuredData ?? null,
        predictedIso2Lang: jobData?.predictedIso2Lang ?? null,
        latentClickRedirectSearchDurationSeconds: jobData?.latentClickRedirectSearchDurationSeconds ?? null,
        forceLatentSearchRedirect: jobData?.forceLatentSearchRedirect ?? null,
        fetchedAt: new Date().toISOString(),
    };
};

const matchesKeyword = (job, keyword) => {
    const normalized = (keyword ?? '').trim().toLowerCase();
    if (!normalized) return true;
    const haystack = [
        job?.title,
        job?.company,
        job?.description,
        job?.location,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    if (!haystack) return false;
    if (haystack.includes(normalized)) return true;

    const terms = normalized.split(/\s+/).filter((term) => term.length >= 3);
    if (!terms.length) return false;
    return terms.some((term) => haystack.includes(term));
};

const matchesLocation = (job, location) => {
    const normalized = (location ?? '').trim().toLowerCase();
    if (!normalized || normalized === 'all') return true;
    const jobLocation = (job?.location ?? '').toLowerCase();
    if (!jobLocation) return false;

    // When users pass an ISO code such as "US", match by country code suffix.
    if (/^[a-z]{2}$/i.test(normalized)) {
        const pattern = new RegExp(`(^|[\\s,])${normalized.toUpperCase()}($|[\\s,])`, 'i');
        return pattern.test(job?.location ?? '');
    }
    return jobLocation.includes(normalized);
};

const matchesEmploymentType = (job, employmentType) => {
    const normalized = normalizeEmploymentType(employmentType);
    if (!normalized) return true;
    const value = (job?.employmentType ?? '').toUpperCase();
    return value.includes(normalized);
};

const matchesSearchFilters = (job, search) => (
    matchesKeyword(job, search.keyword)
    && matchesLocation(job, search.location)
    && matchesEmploymentType(job, search.employmentType)
);

const fetchJobSitemapUrls = async ({ request, stats }) => {
    const response = await requestWithRetries(
        'Source index request',
        () =>
            request({
                url: JOB_SITEMAP_INDEX_URL,
                responseType: 'text',
                session: 'sitemap-index',
                headers: {
                    Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
                },
            }),
        { maxRetries: 3, stats },
    );
    if (response.statusCode !== 200 || !response.body) {
        throw new Error(`Source index request failed with status ${response.statusCode}`);
    }
    return parseSitemapIndexUrls(response.body);
};

const fetchUrlsFromSitemap = async ({ sitemapUrl, request, stats }) => {
    const response = await requestWithRetries(
        'Source page request',
        () =>
            request({
                url: sitemapUrl,
                responseType: 'text',
                session: 'sitemap-jobs',
                headers: {
                    Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
                },
            }),
        { maxRetries: 3, stats },
    );
    if (response.statusCode !== 200 || !response.body) {
        throw new Error(`Source page request failed with status ${response.statusCode}`);
    }
    return parseJobUrlsFromSitemap(response.body);
};

const fetchJobFromInternalApi = async ({ jobId, request, stats }) => {
    const response = await requestWithRetries(
        'Item detail request',
        () =>
            request({
                url: `${INTERNAL_JOB_ENDPOINT}/${jobId}`,
                responseType: 'text',
                session: 'detail-api',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    Referer: 'https://www.collegerecruiter.com/',
                    Origin: 'https://www.collegerecruiter.com',
                },
            }),
        { maxRetries: 2, stats },
    );

    if (response.statusCode !== 200) return null;
    const parsed = parseJsonSafely(response.body);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    const first = jobs.find((item) => item?.data && item?.data?.deletedAt == null);
    if (!first?.data) return null;
    return {
        ...first.data,
        apiStatus: first.status ?? null,
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

    const browser = await firefox.launch({
        headless: true,
        proxy,
    });

    const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1366, height: 768 },
        userAgent: getRandomUserAgent(),
    });

    // Enhanced resource blocking and stealth
    await context.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();

        // Block images, fonts, media, and common trackers
        if (['image', 'font', 'media'].includes(resourceType) ||
            url.includes('google-analytics') ||
            url.includes('googletagmanager') ||
            url.includes('facebook') ||
            url.includes('doubleclick') ||
            url.includes('pinterest') ||
            url.includes('adsense')) {
            await route.abort();
            return;
        }
        await route.continue();
    });

    // Stealth scripts
    await context.addInitScript(() => {
        // Hide webdriver property
        Object.defineProperty(navigator, 'webdriver', { get: () => false });

        // Mock plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });

        // Mock languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });

        // Hide automation indicators
        window.chrome = { runtime: {} };

        // Override permissions query
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    });

    const page = await context.newPage();
    page.setDefaultTimeout(25000);

    const fetchNextData = async (url) => {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        const status = response?.status();
        if (status && status >= 400) {
            throw new Error(`Playwright navigation status ${status}`);
        }

        // Wait a bit for page to stabilize
        await page.waitForTimeout(2000);

        // Extract __NEXT_DATA__ directly from page content (script tags are hidden)
        const html = await page.content();
        const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);

        if (!match || !match[1]) {
            throw new Error('Missing __NEXT_DATA__ in page content');
        }

        try {
            return JSON.parse(match[1]);
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

const fetchSearchPageWithCrawler = async (search, page, request, searchState, stats, proxyConfiguration) => {
    const searchUrl = buildSearchUrl(search, page);

    return new Promise((resolve, reject) => {
        let result = null;
        let error = null;

        const crawler = new PlaywrightCrawler({
            launchContext: {
                launcher: firefox,
                launchOptions: {
                    headless: true,
                },
                userAgent: getRandomUserAgent(),
            },
            proxyConfiguration,
            maxRequestRetries: 3,
            useSessionPool: true,
            sessionPoolOptions: {
                maxPoolSize: 5,
                sessionOptions: { maxUsageCount: 3 },
            },
            maxConcurrency: 1,
            requestHandlerTimeoutSecs: 120,
            navigationTimeoutSecs: 60,
            
            // Fingerprint generation for stealth
            browserPoolOptions: {
                useFingerprints: true,
                fingerprintOptions: {
                    fingerprintGeneratorOptions: {
                        browsers: ['firefox'],
                        operatingSystems: ['windows', 'macos'],
                        devices: ['desktop'],
                    },
                },
            },
            
            // Pre-navigation hooks for resource blocking and stealth
            preNavigationHooks: [
                async ({ page }) => {
                    // Block heavy resources (keep stylesheets if needed for rendering)
                    await page.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        const url = route.request().url();

                        // Block images, fonts, media, and common trackers
                        if (['image', 'font', 'media'].includes(type) ||
                            url.includes('google-analytics') ||
                            url.includes('googletagmanager') ||
                            url.includes('facebook') ||
                            url.includes('doubleclick') ||
                            url.includes('pinterest') ||
                            url.includes('adsense')) {
                            return route.abort();
                        }
                        return route.continue();
                    });

                    // Stealth: Hide webdriver property
                    await page.addInitScript(() => {
                        Object.defineProperty(navigator, 'webdriver', { get: () => false });
                    });
                },
            ],
            
            async requestHandler({ page, request: crawlerRequest }) {
                log.info(`Processing: ${crawlerRequest.url}`);

                // Wait for page to fully load
                await page.waitForLoadState('domcontentloaded');
                await page.waitForLoadState('networkidle').catch(() => {});

                // Wait a bit for dynamic content
                await page.waitForTimeout(2000);

                // Extract __NEXT_DATA__
                const html = await page.content();
                const match = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);

                if (!match || !match[1]) {
                    throw new Error('Missing __NEXT_DATA__ in page content');
                }

                let payload;
                try {
                    payload = JSON.parse(match[1]);
                } catch (err) {
                    throw new Error(`Failed to parse __NEXT_DATA__: ${err.message}`);
                }

                const normalized = normalizeNextDataPayload(payload);
                if (normalized?.requiresVerification) {
                    throw new Error('Playwright session still requires Turnstile verification.');
                }
                if (normalized?.jobs?.length) {
                    result = { ...normalized, source: 'playwright-crawler', url: searchUrl };
                } else {
                    throw new Error('No jobs found in page data');
                }
            },

            failedRequestHandler({ request }, err) {
                error = err;
                log.error(`Crawler request ${request.url} failed: ${err.message}`);
            },
        });

        crawler.run([{ url: searchUrl }]).then(() => {
            if (result) {
                resolve(result);
            } else {
                reject(error || new Error('No data extracted'));
            }
        }).catch(reject);
    });
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
    let requiresVerification = false;

    const internalSearchUrl = buildInternalApiSearchUrl(search, page);
    try {
        const res = await requestWithRetries(
            'Internal search API request',
            () =>
                request({
                    url: internalSearchUrl,
                    responseType: 'text',
                    session: 'search-internal-api',
                    headers: {
                        Accept: 'application/json, text/plain, */*',
                        Referer: searchUrl,
                        Origin: 'https://www.collegerecruiter.com',
                    },
                }),
            { maxRetries: 2, stats },
        );

        const payload = parseJsonSafely(res.body);
        if (res.statusCode === 200 && payload) {
            const normalized = normalizeInternalSearchPayload(payload);
            if (normalized?.requiresVerification) {
                requiresVerification = true;
                log.warning('Internal search API requires verification for this session.');
            }
            if (normalized?.jobs?.length) {
                return { ...normalized, source: 'internal-search-api', url: searchUrl };
            }
        } else if (res.statusCode === 403) {
            if (payload?.requiresVerification) {
                requiresVerification = true;
                log.warning('Internal search API blocked by verification gate.');
            } else {
                log.warning('Internal search API returned 403 without explicit verification flag.');
            }
        } else if (res.statusCode && res.statusCode >= 400) {
            log.warning(`Internal search API responded with status ${res.statusCode}`);
        }
    } catch (error) {
        log.warning(`Internal search API lookup failed: ${error.message}`);
    }

    if (searchState.buildId) {
        try {
            const nextDataUrl = `${NEXT_DATA_ENDPOINT}/${searchState.buildId}/job-search.json?${params.toString()}`;
            const res = await requestWithRetries(
                'JSON API request',
                () =>
                    request({
                        url: nextDataUrl,
                        responseType: 'text',
                        session: 'search-json',
                        headers: {
                            Accept: 'application/json, text/plain, */*',
                            Referer: searchUrl,
                            Origin: 'https://www.collegerecruiter.com',
                        },
                    }),
                { maxRetries: 2, stats },
            );
            const payload = parseJsonSafely(res.body);
            if (res.statusCode === 200 && payload) {
                const normalized = normalizeNextDataPayload(payload);
                if (normalized?.requiresVerification) {
                    requiresVerification = true;
                    log.warning('Next.js JSON endpoint requires verification for this session.');
                }
                if (normalized?.jobs?.length) {
                    return { ...normalized, source: 'json-api', url: searchUrl };
                }
            } else if (res.statusCode === 404) {
                searchState.buildId = null;
            } else if (res.statusCode === 403 && payload?.requiresVerification) {
                requiresVerification = true;
                log.warning('Next.js JSON endpoint blocked by verification gate.');
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
            if (parsedNextData?.requiresVerification) {
                requiresVerification = true;
                log.warning('Search HTML reports requiresVerification=true in __NEXT_DATA__.');
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
    if (lastStatus === 403 || !htmlBody || requiresVerification) {
        log.info('Attempting Playwright crawler fallback due to blocking or missing HTML data');
        try {
            if (!proxyConfiguration) log.warning('Proxy configuration missing for Playwright fallback');
            const result = await fetchSearchPageWithCrawler(search, page, request, searchState, stats, proxyConfiguration);
            return result;
        } catch (err) {
            log.warning(`Playwright crawler fallback failed: ${err.message}`);
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
        results_wanted: resultsWantedRaw = 20,
        max_pages: maxPagesRaw = 10,
        maxConcurrency = 10,
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
    const saveLimiter = createLimiter(1);
    let saved = 0;

    const startTime = Date.now();
    const MAX_RUNTIME_MS = 3.5 * 60 * 1000;
    const stats = { pagesProcessed: 0, jobsSaved: 0, requests: 0, errors: 0 };
    const searchState = { buildId: null };

    log.info('Starting College Recruiter scraper');
    log.info(`Search params: keyword="${searchKeyword}", location="${searchLocation}"`);
    log.info(`Target: ${resultsWanted} jobs across ${maxPages} batches max`);

    const searchConfig = {
        keyword: searchKeyword,
        location: searchLocation,
        employmentType: searchEmploymentType,
    };

    let sitemapUrls = [];
    try {
        sitemapUrls = await fetchJobSitemapUrls({ request, stats });
    } catch (err) {
        stats.errors += 1;
        throw new Error(`Unable to load source index: ${err.message}`);
    }

    if (sitemapUrls.length === 0) {
        throw new Error('No source pages found in source index.');
    }

    const sitemapsToScan = sitemapUrls.slice(0, maxPages);
    const maxUrlsPerSitemap = Math.max(MIN_URLS_PER_SITEMAP_SCAN, resultsWanted * 20);
    log.info(`Discovered ${sitemapUrls.length} source pages. Scanning latest ${sitemapsToScan.length}.`);

    for (let page = 1; page <= sitemapsToScan.length && saved < resultsWanted; page += 1) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            log.info(`Timeout safety triggered at ${elapsed}s. Saved ${saved}/${resultsWanted} jobs.`);
            await Actor.setValue('TIMEOUT_REACHED', true);
            break;
        }

        stats.pagesProcessed = page;
        const sitemapUrl = sitemapsToScan[page - 1];
        log.info(`Scanning batch ${page}/${sitemapsToScan.length}`);

        let sitemapJobUrls = [];
        try {
            sitemapJobUrls = await fetchUrlsFromSitemap({
                sitemapUrl,
                request,
                stats,
            });
        } catch (err) {
            stats.errors += 1;
            log.warning(`Failed to load batch ${page}: ${err.message}`);
            continue;
        }

        if (!sitemapJobUrls.length) {
            log.info(`No records found in batch ${page}.`);
            continue;
        }

        const candidateUrls = sitemapJobUrls.slice(0, maxUrlsPerSitemap);
        log.info(`Batch ${page}: Found ${sitemapJobUrls.length} candidates. Processing up to ${candidateUrls.length}.`);

        const detailPromises = candidateUrls.map((jobUrl) =>
            limiter(async () => {
                if (saved >= resultsWanted) return;

                const jobId = extractJobIdFromUrl(jobUrl);
                if (!jobId) return;
                if (jobId && seenIds.has(jobId)) {
                    log.debug(`Skipping duplicate job ${jobId}`);
                    return;
                }
                if (jobId) seenIds.add(jobId);

                try {
                    const apiJob = await fetchJobFromInternalApi({ jobId, request, stats });
                    if (!apiJob) return;

                    const job = mapApiJobToOutput(apiJob, jobUrl);
                    if (!matchesSearchFilters(job, searchConfig)) return;

                    await saveLimiter(async () => {
                        if (saved >= resultsWanted) return;
                        await Dataset.pushData(job);
                        saved += 1;
                        stats.jobsSaved = saved;

                        if (saved % 10 === 0) {
                            const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
                            log.info(`Progress: ${saved}/${resultsWanted} jobs saved (${elapsedSeconds}s elapsed)`);
                        }
                    });
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
