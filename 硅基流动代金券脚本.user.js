// ==UserScript==
// @name         硅基流动代金券助手
// @namespace    https://cloud.siliconflow.cn/
// @version      1.0.1
// @description  在硅基流动平台显示代金券总额，并在模型页面标识支持代金券的模型
// @author       ouyangqiqi     by https://github.com/hyb-oyqq
// @match        https://cloud.siliconflow.cn/*
// @grant        GM_xmlhttpRequest
// @connect      cloud.siliconflow.cn
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // 常量定义
    // ============================================
    const API_ENDPOINTS = {
        // 基础 URL，分页参数在请求时动态添加
        walletsBase: 'https://cloud.siliconflow.cn/walletd-server/api/v1/subject/wallets',
        // packages API - 获取代金券包类型定义
        packages: 'https://cloud.siliconflow.cn/cpc-server/api/v1/packages?ids=[0,1,2,3,4,5,6,7,8,9,10]',
    };
    
    // 分页配置
    const PAGINATION = {
        pageSize: 10000,  // 设置足够大，一次性获取所有数据
        stage: 3,       // 代金券状态
    };

    // 页面类型枚举
    const PAGE_TYPE = {
        EXPENSE_BILL: 'expensebill',
        MODELS: 'models',
        UNKNOWN: 'unknown',
    };

    // ============================================
    // URL 路由模块
    // ============================================
    const URLRouter = {
        /**
         * 判断当前 URL 是否匹配硅基流动云平台
         * @param {string} url - URL 字符串
         * @returns {boolean}
         */
        isSiliconFlowDomain(url) {
            try {
                const urlObj = new URL(url);
                return urlObj.hostname === 'cloud.siliconflow.cn';
            } catch (e) {
                return false;
            }
        },

        /**
         * 获取当前页面类型
         * @param {string} url - URL 字符串
         * @returns {string} PAGE_TYPE 枚举值
         */
        getPageType(url) {
            if (!this.isSiliconFlowDomain(url)) {
                return PAGE_TYPE.UNKNOWN;
            }

            const pathname = new URL(url).pathname;
            
            // 匹配 /me/expensebill 或 /{subjectId}/expensebill 路径
            if (/^\/[^/]+\/expensebill/.test(pathname)) {
                return PAGE_TYPE.EXPENSE_BILL;
            }
            
            // 仅匹配 /me/models 路径（精确匹配）
            if (/^\/me\/models\/?$/.test(pathname)) {
                return PAGE_TYPE.MODELS;
            }

            return PAGE_TYPE.UNKNOWN;
        },

        /**
         * 获取当前页面类型（使用当前 location）
         * @returns {string}
         */
        getCurrentPageType() {
            return this.getPageType(window.location.href);
        },
    };

    // ============================================
    // API 数据获取模块
    // ============================================
    const APIFetcher = {
        // 请求超时时间（毫秒）
        TIMEOUT: 10000,

        // 模块名称（用于日志）
        MODULE_NAME: 'APIFetcher',

        /**
         * 获取当前用户的 subjectId
         * @returns {string|null} subjectId
         */
        getSubjectId() {
            // 方法1: 从 window.subjectInfo 获取
            if (window.subjectInfo && window.subjectInfo.subjectId) {
                return window.subjectInfo.subjectId;
            }
            
            // 方法2: 从 URL 路径获取 (格式: /subjectId/expensebill)
            const pathname = window.location.pathname;
            const match = pathname.match(/^\/([^/]+)\//);
            if (match && match[1] && match[1] !== 'me' && match[1] !== 'models') {
                return match[1];
            }
            
            // 方法3: 从 cookie 或 localStorage 获取
            try {
                const stored = localStorage.getItem('subjectId');
                if (stored) return stored;
            } catch (e) {}
            
            // 方法4: 从页面中查找
            try {
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent || '';
                    const subjectMatch = content.match(/subjectId['":\s]+['"]([a-zA-Z0-9]+)['"]/);
                    if (subjectMatch) {
                        return subjectMatch[1];
                    }
                }
            } catch (e) {}
            
            return null;
        },

        /**
         * 使用 GM_xmlhttpRequest 发起请求
         * @param {string} url - 请求 URL
         * @param {Object} options - 请求选项
         * @returns {Promise<Object>} 响应数据
         */
        request(url, options = {}) {
            return new Promise((resolve, reject) => {
                try {
                    // 获取 subjectId 用于请求头
                    const subjectId = this.getSubjectId();
                    
                    const headers = {
                        'Content-Type': 'application/json',
                        'Accept': '*/*',
                        ...options.headers,
                    };
                    
                    // 添加 x-subject-id header（如果有）
                    if (subjectId) {
                        headers['x-subject-id'] = subjectId;
                    }
                    
                    const config = {
                        method: options.method || 'GET',
                        url: url,
                        timeout: options.timeout || this.TIMEOUT,
                        headers: headers,
                        onload: (response) => {
                            try {
                                if (response.status >= 200 && response.status < 300) {
                                    const data = JSON.parse(response.responseText);
                                    resolve(data);
                                } else {
                                    const error = new Error(`HTTP Error: ${response.status}`);
                                    error.status = response.status;
                                    reject(error);
                                }
                            } catch (e) {
                                reject(new Error(`JSON Parse Error: ${e.message}`));
                            }
                        },
                        onerror: (error) => {
                            reject(new Error(`Network Error: ${error.message || 'Unknown error'}`));
                        },
                        ontimeout: () => {
                            reject(new Error(`Request Timeout: ${url}`));
                        },
                    };

                    // 检查 GM_xmlhttpRequest 是否可用
                    if (typeof GM_xmlhttpRequest !== 'undefined') {
                        GM_xmlhttpRequest(config);
                    } else {
                        // 降级到 fetch（用于测试环境）- 使用 credentials 携带 cookie
                        console.warn('[代金券助手] GM_xmlhttpRequest 不可用，使用 fetch 降级');
                        fetch(url, {
                            method: config.method,
                            headers: headers,
                            credentials: 'include',  // 携带 cookie
                        })
                            .then(res => {
                                if (!res.ok) {
                                    throw new Error(`HTTP Error: ${res.status}`);
                                }
                                return res.json();
                            })
                            .then(resolve)
                            .catch(reject);
                    }
                } catch (error) {
                    reject(new Error(`Request Setup Error: ${error.message}`));
                }
            });
        },

        /**
         * 获取用户代金券钱包列表
         * @param {boolean} useCache - 是否使用缓存，默认 true
         * @returns {Promise<Object>} WalletsResponse
         */
        async fetchWallets(useCache = true) {
            // 检查缓存
            if (useCache) {
                try {
                    const cached = DataCache.get(DataCache.CACHE_KEYS.WALLETS);
                    if (cached) {
                        console.log('[代金券助手] 使用缓存的代金券列表');
                        return cached;
                    }
                } catch (cacheError) {
                    console.warn('[代金券助手] 读取缓存失败:', cacheError.message);
                }
            }

            try {
                console.log('[代金券助手] 正在获取代金券列表...');
                
                // 一次性获取所有代金券
                const url = `${API_ENDPOINTS.walletsBase}?pageSize=${PAGINATION.pageSize}&stage=${PAGINATION.stage}`;
                const response = await this.request(url);
                
                let wallets = [];
                let totalCount = 0;
                
                if (response && typeof response === 'object') {
                    if (response.code === 20000 && response.data) {
                        wallets = response.data.wallets || response.data.items || [];
                        totalCount = response.data.pagination?.total || wallets.length;
                    } else if (response.wallets) {
                        wallets = response.wallets;
                        totalCount = response.pagination?.total || wallets.length;
                    }
                }
                
                if (!Array.isArray(wallets)) {
                    wallets = [];
                }

                console.log(`[代金券助手] 获取到 ${wallets.length} 个代金券，总数 ${totalCount}`);
                
                const result = {
                    success: true,
                    wallets: wallets,
                    total: totalCount,
                };

                // 存入缓存
                try {
                    DataCache.set(DataCache.CACHE_KEYS.WALLETS, result);
                } catch (cacheError) {
                    console.warn('[代金券助手] 写入缓存失败:', cacheError.message);
                }
                
                return result;
            } catch (error) {
                console.error('[代金券助手] 获取代金券列表失败:', error.message);
                return {
                    success: false,
                    wallets: [],
                    total: 0,
                    error: error.message,
                };
            }
        },

        /**
         * 获取代金券包类型定义
         * @param {boolean} useCache - 是否使用缓存，默认 true
         * @returns {Promise<Object>} PackagesResponse
         */
        async fetchPackages(useCache = true) {
            // 检查缓存
            if (useCache) {
                try {
                    const cached = DataCache.get(DataCache.CACHE_KEYS.PACKAGES);
                    if (cached) {
                        console.log('[代金券助手] 使用缓存的代金券包类型');
                        return cached;
                    }
                } catch (cacheError) {
                    console.warn('[代金券助手] 读取缓存失败:', cacheError.message);
                }
            }

            try {
                console.log('[代金券助手] 正在获取代金券包类型...');
                const response = await this.request(API_ENDPOINTS.packages);
                
                // 兼容多种响应格式
                let packages = [];
                
                if (Array.isArray(response)) {
                    packages = response;
                } else if (response && typeof response === 'object') {
                    if (response.code === 20000 && response.data) {
                        packages = response.data.packages || response.data.items || response.data || [];
                    } else if (response.items) {
                        packages = response.items;
                    } else if (response.packages) {
                        packages = response.packages;
                    } else if (response.data) {
                        packages = Array.isArray(response.data) ? response.data : (response.data.packages || response.data.items || []);
                    }
                }
                
                if (!Array.isArray(packages)) {
                    packages = [];
                }

                console.log(`[代金券助手] 获取到 ${packages.length} 个代金券包类型`);
                
                const result = {
                    success: true,
                    packages: packages,
                };

                // 存入缓存
                try {
                    DataCache.set(DataCache.CACHE_KEYS.PACKAGES, result);
                } catch (cacheError) {
                    console.warn('[代金券助手] 写入缓存失败:', cacheError.message);
                }
                
                return result;
            } catch (error) {
                console.error('[代金券助手] 获取代金券包类型失败:', error.message);
                return {
                    success: false,
                    packages: [],
                    error: error.message,
                };
            }
        },

        /**
         * 从代金券包描述中提取支持的模型列表
         * @param {string} description - 描述字段（JSON 字符串）
         * @returns {string[]} 模型名称列表
         */
        extractModelsFromDescription(description) {
            if (!description) {
                return [];
            }

            try {
                // 解析 JSON 字符串
                let descObj;
                try {
                    descObj = JSON.parse(description);
                } catch (parseError) {
                    console.warn('[代金券助手] 描述字段 JSON 解析失败，尝试直接使用:', parseError.message);
                    // 如果不是 JSON，直接使用原字符串
                    descObj = { 'zh-cn': description };
                }
                
                // 优先使用中文描述
                const descText = descObj['zh-cn'] || descObj['en-us'] || '';
                
                if (!descText || typeof descText !== 'string') {
                    return [];
                }
                
                // 从 markdown 格式中提取模型名称
                // 格式通常为: - model-name 或 * model-name
                const modelPattern = /[-*]\s*`?([a-zA-Z0-9\-_/\.]+)`?/g;
                const models = [];
                let match;
                
                while ((match = modelPattern.exec(descText)) !== null) {
                    const modelName = match[1].trim();
                    if (modelName && !models.includes(modelName)) {
                        models.push(modelName);
                    }
                }
                
                return models;
            } catch (e) {
                console.warn('[代金券助手] 解析描述字段失败:', e.message);
                return [];
            }
        },

        /**
         * 获取所有代金券包支持的模型映射
         * @param {Array} packages - 代金券包列表
         * @returns {Map<string, number[]>} 模型名称 -> 支持的 packageId 列表
         */
        buildSupportedModelMap(packages) {
            const modelMap = new Map();
            
            if (!Array.isArray(packages)) {
                console.warn('[代金券助手] packages 参数不是数组');
                return modelMap;
            }
            
            for (const pkg of packages) {
                try {
                    if (!pkg || typeof pkg.id === 'undefined') {
                        continue;
                    }
                    
                    const models = this.extractModelsFromDescription(pkg.description);
                    for (const model of models) {
                        if (!modelMap.has(model)) {
                            modelMap.set(model, []);
                        }
                        modelMap.get(model).push(pkg.id);
                    }
                } catch (error) {
                    console.warn('[代金券助手] 处理代金券包时出错:', error.message);
                }
            }
            
            return modelMap;
        },
    };

    // ============================================
    // 代金券计算模块
    // ============================================
    const VoucherCalculator = {
        // 余额单位转换：API 返回的 balance 单位是 10^-12 元
        BALANCE_DIVISOR: 1e12,

        /**
         * 从 JSON 字符串中解析指定语言的名称
         * @param {string} nameJson - JSON 格式的名称字符串，如 '{"en-us":"Gift Balance","zh-cn":"模型服务代金券"}'
         * @param {string} lang - 语言代码，默认 'zh-cn'
         * @returns {string} 解析后的名称，解析失败时返回原字符串或默认值
         */
        parseWalletName(nameJson, lang = 'zh-cn') {
            if (!nameJson || typeof nameJson !== 'string') {
                return '未知代金券';
            }

            try {
                const nameObj = JSON.parse(nameJson);
                // 优先返回指定语言，其次英文，最后返回任意可用值
                return nameObj[lang] || nameObj['en-us'] || Object.values(nameObj)[0] || nameJson;
            } catch (e) {
                // JSON 解析失败，返回原字符串
                console.warn('[代金券助手] 解析代金券名称失败:', e.message);
                return nameJson;
            }
        },

        /**
         * 计算代金券总余额
         * @param {Array<{balance: number}>} wallets - 代金券列表
         * @returns {number} 总余额（单位：元）
         */
        calculateTotalBalance(wallets) {
            if (!Array.isArray(wallets) || wallets.length === 0) {
                return 0;
            }

            const totalRaw = wallets.reduce((sum, wallet) => {
                // 确保 balance 是有效数字
                const balance = typeof wallet.balance === 'number' ? wallet.balance : 0;
                return sum + balance;
            }, 0);

            // 转换为元（除以 10^12）
            return totalRaw / this.BALANCE_DIVISOR;
        },

        /**
         * 格式化余额显示
         * @param {number} balance - 余额（单位：元）
         * @param {number} decimals - 小数位数，默认 2
         * @returns {string} 格式化后的字符串，如 "14.00 元"
         */
        formatBalance(balance, decimals = 2) {
            if (typeof balance !== 'number' || isNaN(balance)) {
                return '0.00 元';
            }

            // 使用 toFixed 格式化小数位
            const formatted = balance.toFixed(decimals);
            return `${formatted} 元`;
        },

        /**
         * 获取代金券汇总信息
         * @param {Array} wallets - 代金券列表
         * @returns {Object} 汇总信息
         */
        getSummary(wallets) {
            if (!Array.isArray(wallets)) {
                return {
                    totalBalance: 0,
                    formattedTotal: '0.00 元',
                    voucherCount: 0,
                    byPackageType: new Map(),
                };
            }

            const totalBalance = this.calculateTotalBalance(wallets);
            const byPackageType = new Map();

            for (const wallet of wallets) {
                const packageId = wallet.packageId;
                if (!byPackageType.has(packageId)) {
                    byPackageType.set(packageId, {
                        balance: 0,
                        count: 0,
                    });
                }

                const group = byPackageType.get(packageId);
                group.balance += (wallet.balance || 0) / this.BALANCE_DIVISOR;
                group.count += 1;
            }

            return {
                totalBalance,
                formattedTotal: this.formatBalance(totalBalance),
                voucherCount: wallets.length,
                byPackageType,
            };
        },
    };

    // ============================================
    // 代金券面板 UI 组件模块
    // ============================================
    const VoucherPanelUI = {
        // 标记 ID
        INJECTED_FLAG: 'voucher-amount-injected',
        
        // 保存原始卡片引用
        voucherCard: null,

        /**
         * 创建注入样式
         * @returns {string} CSS 样式字符串
         */
        createStyles() {
            return `
                .voucher-amount-display {
                    font-size: 24px;
                    font-weight: 600;
                    color: #7c3aed;
                    line-height: 1.2;
                    margin-top: 4px;
                }
                .voucher-amount-hint {
                    font-size: 12px;
                    color: rgba(0, 0, 0, 0.45);
                    margin-top: 4px;
                }
                .voucher-card-hijacked {
                    cursor: pointer;
                    transition: box-shadow 0.2s;
                }
                .voucher-card-hijacked:hover {
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .voucher-original-hidden {
                    display: none !important;
                }
            `;
        },

        /**
         * 注入样式到页面
         */
        injectStyles() {
            if (document.getElementById('voucher-panel-styles')) {
                return;
            }
            const styleEl = document.createElement('style');
            styleEl.id = 'voucher-panel-styles';
            styleEl.textContent = this.createStyles();
            document.head.appendChild(styleEl);
        },

        /**
         * 查找原有的代金券卡片
         * @returns {HTMLElement|null} 代金券卡片元素
         */
        findVoucherCard() {
            // 策略1: 使用 TreeWalker 查找文本节点
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let textNode;
            while (textNode = walker.nextNode()) {
                const text = textNode.textContent.trim();
                if (text === '代金券') {
                    // 向上查找卡片容器
                    let parent = textNode.parentElement;
                    for (let i = 0; i < 10 && parent; i++) {
                        const rect = parent.getBoundingClientRect();
                        
                        // 卡片特征：合理的尺寸，包含数量显示
                        if (rect.width > 100 && rect.height > 50 && rect.height < 300) {
                            if (parent.textContent.includes('张') || /\d+\+?/.test(parent.textContent)) {
                                return parent;
                            }
                        }
                        parent = parent.parentElement;
                    }
                }
            }
            
            // 策略2: 查找包含"代金券"和"张"的容器（排除太大的）
            const allElements = document.querySelectorAll('div, section, article');
            for (const el of allElements) {
                const text = el.textContent;
                if (text.includes('代金券') && text.includes('张') && !text.includes('代金券总额') && !text.includes('余额')) {
                    const rect = el.getBoundingClientRect();
                    // 合理的卡片大小
                    if (rect.width > 100 && rect.width < 500 && rect.height > 50 && rect.height < 300) {
                        // 确保不是整个页面容器
                        if (el.querySelectorAll('div').length < 20) {
                            return el;
                        }
                    }
                }
            }
            
            // 策略3: 查找"兑换代金券"链接/按钮附近的卡片
            const allLinks = document.querySelectorAll('a, button, [role="button"], span[class*="cursor"]');
            for (const link of allLinks) {
                if (link.textContent.includes('兑换代金券') || link.textContent.includes('兑换')) {
                    let parent = link.parentElement;
                    for (let i = 0; i < 8 && parent; i++) {
                        const rect = parent.getBoundingClientRect();
                        if (rect.width > 100 && rect.height > 50 && rect.height < 300) {
                            if (parent.textContent.includes('代金券')) {
                                return parent;
                            }
                        }
                        parent = parent.parentElement;
                    }
                }
            }
            
            return null;
        },

        /**
         * 劫持代金券卡片，注入金额显示
         * @param {Object} data - 代金券数据
         */
        hijackVoucherCard(data) {
            this.injectStyles();
            
            const card = this.findVoucherCard();
            if (!card) {
                console.warn('[代金券助手] 未找到代金券卡片');
                return false;
            }
            
            // 检查是否已经注入
            if (card.getAttribute(this.INJECTED_FLAG)) {
                // 已注入，只更新金额
                const amountEl = card.querySelector('.voucher-amount-display');
                if (amountEl) {
                    amountEl.textContent = `¥ ${data.totalBalance.toFixed(4)}`;
                }
                const hintEl = card.querySelector('.voucher-amount-hint');
                if (hintEl) {
                    hintEl.textContent = `共 ${data.voucherCount} 张`;
                }
                return true;
            }
            
            this.voucherCard = card;
            
            // 查找并隐藏原有的数量显示（"99+" 和 "张"）
            const allElements = card.querySelectorAll('*');
            let numberElement = null;
            let unitElement = null;
            
            for (const el of allElements) {
                if (el.children.length === 0) {
                    const text = el.textContent.trim();
                    // 匹配 "99+" 或纯数字
                    if (/^\d+\+?$/.test(text)) {
                        numberElement = el;
                    }
                    // 匹配 "张"
                    if (text === '张') {
                        unitElement = el;
                    }
                }
            }
            
            // 隐藏原有的数量和单位
            if (numberElement) {
                numberElement.classList.add('voucher-original-hidden');
            }
            if (unitElement) {
                unitElement.classList.add('voucher-original-hidden');
            }
            
            // 找到合适的插入位置（数量元素的父容器）
            let insertContainer = numberElement ? numberElement.parentElement : card;
            
            // 创建金额显示
            const amountDiv = document.createElement('div');
            amountDiv.className = 'voucher-amount-display';
            amountDiv.textContent = `¥ ${data.totalBalance.toFixed(4)}`;
            
            const hintDiv = document.createElement('div');
            hintDiv.className = 'voucher-amount-hint';
            hintDiv.textContent = `共 ${data.voucherCount} 张`;
            
            // 插入新元素
            insertContainer.appendChild(amountDiv);
            insertContainer.appendChild(hintDiv);
            
            // 添加 hover 效果
            card.classList.add('voucher-card-hijacked');
            
            // 标记已注入
            card.setAttribute(this.INJECTED_FLAG, 'true');
            return true;
        },

        /**
         * 移除注入的内容
         */
        removePanel() {
            if (this.voucherCard) {
                const amountEl = this.voucherCard.querySelector('.voucher-amount-display');
                const hintEl = this.voucherCard.querySelector('.voucher-amount-hint');
                if (amountEl) amountEl.remove();
                if (hintEl) hintEl.remove();
                this.voucherCard.classList.remove('voucher-card-hijacked');
                this.voucherCard.removeAttribute(this.INJECTED_FLAG);
                this.voucherCard = null;
            }
        },
    };

    // ============================================
    // DOM 注入模块
    // ============================================
    const DOMInjector = {
        // 模块名称（用于日志）
        MODULE_NAME: 'DOMInjector',

        /**
         * 在费用账单页面注入代金券面板（劫持模式）
         */
        async injectVoucherPanel() {
            try {
                // 等待页面加载
                await new Promise(resolve => setTimeout(resolve, 1500));

                // 获取代金券数据
                const walletsResult = await APIFetcher.fetchWallets();
                
                if (!walletsResult.success) {
                    console.error('[代金券助手] 获取代金券数据失败:', walletsResult.error);
                    return;
                }

                // 计算汇总信息
                const summary = VoucherCalculator.getSummary(walletsResult.wallets);
                
                // 劫持代金券卡片并注入金额
                const success = VoucherPanelUI.hijackVoucherCard(summary);
                if (!success) {
                    console.warn('[代金券助手] 未能劫持代金券卡片');
                }

            } catch (error) {
                console.error('[代金券助手] 注入代金券面板失败:', error.message);
            }
        },

        /**
         * 清理注入的 UI
         */
        cleanup() {
            try {
                VoucherPanelUI.removePanel();
            } catch (error) {
                console.warn('[代金券助手] 清理 UI 时出错:', error.message);
            }
        },
    };

    // ============================================
    // 模型标记模块
    // ============================================
    const ModelMarker = {
        // DOM 选择器（基于设计文档）
        SELECTORS: {
            // 模型卡片网格容器
            modelGrid: '.grid.w-full.gap-3',
            // 单个模型卡片
            modelCard: 'div[class*="relative"][class*="flex"][class*="cursor-pointer"][class*="rounded-lg"]',
            // 模型名称元素
            modelName: 'div[class*="truncate"][class*="break-all"][class*="text-base"]',
            // 模型标签容器
            modelTags: 'div[class*="flex"][class*="gap-2"][class*="truncate"]',
            // 导航栏/工具栏区域
            toolbar: '[class*="flex"][class*="items-center"][class*="gap"]',
        },

        // 徽章 ID 前缀
        BADGE_ID_PREFIX: 'voucher-badge-',
        
        // 开关 ID
        TOGGLE_ID: 'voucher-marker-toggle',
        
        // 开关状态存储键
        STORAGE_KEY: 'voucher_marker_enabled',

        // 缓存的支持模型映射
        supportedModelMap: null,
        
        // 标记功能是否启用
        enabled: true,

        // 模块名称（用于日志）
        MODULE_NAME: 'ModelMarker',
        
        /**
         * 获取开关状态
         */
        getEnabled() {
            try {
                const stored = localStorage.getItem(this.STORAGE_KEY);
                return stored === null ? true : stored === 'true';
            } catch (e) {
                return true;
            }
        },
        
        /**
         * 设置开关状态
         */
        setEnabled(value) {
            this.enabled = value;
            try {
                localStorage.setItem(this.STORAGE_KEY, value.toString());
            } catch (e) {}
        },
        
        /**
         * 创建并插入开关按钮
         */
        createToggleButton() {
            // 检查是否已存在
            if (document.getElementById(this.TOGGLE_ID)) {
                return;
            }
            
            const toggle = document.createElement('span');
            toggle.id = this.TOGGLE_ID;
            toggle.className = this.enabled ? 'active' : '';
            toggle.innerHTML = `<span class="toggle-icon">🎫</span><span>代金券标记</span>`;
            toggle.title = this.enabled ? '点击关闭代金券标记' : '点击开启代金券标记';
            
            // 直接使用固定定位，放在页面右上角
            toggle.style.cssText = 'position: fixed; top: 70px; right: 20px; z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';
            
            toggle.addEventListener('click', () => {
                this.enabled = !this.enabled;
                this.setEnabled(this.enabled);
                toggle.className = this.enabled ? 'active' : '';
                toggle.title = this.enabled ? '点击关闭代金券标记' : '点击开启代金券标记';
                
                if (this.enabled) {
                    // 开启标记
                    if (this.supportedModelMap) {
                        this.markSupportedModels(this.supportedModelMap);
                    }
                } else {
                    // 关闭标记，仅移除徽章（保留开关按钮）
                    this.removeBadges();
                }
                
                console.log(`[代金券助手] 模型标记已${this.enabled ? '开启' : '关闭'}`);
            });
            
            // 直接添加到 body
            document.body.appendChild(toggle);
            console.log('[代金券助手] 开关按钮已添加');
        },

        /**
         * 创建徽章样式
         * @returns {string} CSS 样式字符串
         */
        createStyles() {
            return `
                .voucher-support-badge {
                    position: absolute;
                    left: 0;
                    top: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-bottom-right-radius: 0.375rem;
                    padding: 0.125rem 0.5rem;
                    font-size: 0.7rem;
                    color: #fff;
                    background-color: #52c41a;
                    z-index: 10;
                }
                .voucher-support-tag {
                    background-color: rgba(82, 196, 26, 0.1);
                    color: #52c41a;
                    display: inline-flex;
                    align-items: center;
                    border-radius: 0.25rem;
                    padding: 0.1em 0.5rem;
                    font-size: 0.75rem;
                    white-space: nowrap;
                }
                /* 模型标记开关样式 */
                #voucher-marker-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 10px;
                    margin-left: 12px;
                    background: #f5f5f5;
                    border: 1px solid #d9d9d9;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.2s;
                }
                #voucher-marker-toggle:hover {
                    border-color: #52c41a;
                }
                #voucher-marker-toggle.active {
                    background: #f6ffed;
                    border-color: #52c41a;
                    color: #52c41a;
                }
                #voucher-marker-toggle .toggle-icon {
                    font-size: 14px;
                }
            `;
        },

        /**
         * 注入样式到页面
         */
        injectStyles() {
            try {
                if (document.getElementById('voucher-model-marker-styles')) {
                    return;
                }
                const styleEl = document.createElement('style');
                styleEl.id = 'voucher-model-marker-styles';
                styleEl.textContent = this.createStyles();
                document.head.appendChild(styleEl);
            } catch (error) {
                console.warn('[代金券助手] 注入样式失败:', error.message);
            }
        },

        /**
         * 获取页面中所有模型卡片
         * @returns {HTMLElement[]} 模型卡片元素数组
         */
        getModelCards() {
            try {
                // 首先尝试在模型网格容器中查找
                const grid = document.querySelector(this.SELECTORS.modelGrid);
                if (grid) {
                    // 在网格中查找所有卡片
                    const cards = grid.querySelectorAll(this.SELECTORS.modelCard);
                    if (cards.length > 0) {
                        return Array.from(cards);
                    }
                }

                // 降级：在整个页面中查找模型卡片
                const allCards = document.querySelectorAll(this.SELECTORS.modelCard);
                return Array.from(allCards);
            } catch (error) {
                console.warn('[代金券助手] 获取模型卡片失败:', error.message);
                return [];
            }
        },

        /**
         * 从模型卡片中提取模型名称
         * @param {HTMLElement} card - 模型卡片元素
         * @returns {string|null} 模型名称或 null
         */
        extractModelName(card) {
            if (!card) {
                return null;
            }

            try {
                // 尝试从卡片中找到模型名称元素
                const nameElement = card.querySelector(this.SELECTORS.modelName);
                if (nameElement) {
                    const name = nameElement.textContent?.trim();
                    if (name) {
                        return name;
                    }
                }

                // 降级：尝试从卡片的 title 属性获取
                const titleAttr = card.getAttribute('title');
                if (titleAttr) {
                    return titleAttr.trim();
                }

                // 降级：尝试从卡片内的任何文本中提取模型名称格式
                // 模型名称通常格式为: provider/model-name
                const cardText = card.textContent || '';
                const modelPattern = /([a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_\.]+)/;
                const match = cardText.match(modelPattern);
                if (match) {
                    return match[1];
                }

                return null;
            } catch (error) {
                console.warn('[代金券助手] 提取模型名称失败:', error.message);
                return null;
            }
        },

        /**
         * 遍历所有模型卡片并提取名称
         * @returns {Array<{card: HTMLElement, name: string}>} 卡片和名称的映射数组
         */
        getAllModelCardsWithNames() {
            const cards = this.getModelCards();
            const result = [];

            for (const card of cards) {
                try {
                    const name = this.extractModelName(card);
                    if (name) {
                        result.push({ card, name });
                    }
                } catch (error) {
                    console.warn('[代金券助手] 处理模型卡片时出错:', error.message);
                }
            }

            console.log(`[代金券助手] 找到 ${result.length} 个模型卡片`);
            return result;
        },

        /**
         * 检查模型是否支持代金券
         * @param {string} modelName - 模型名称
         * @param {Map<string, number[]>} supportedModelMap - 支持的模型映射
         * @returns {boolean} 是否支持
         */
        isModelSupported(modelName, supportedModelMap) {
            if (!modelName || !supportedModelMap) {
                return false;
            }

            try {
                // 直接精确匹配
                if (supportedModelMap.has(modelName)) {
                    return true;
                }

                // 尝试不区分大小写的精确匹配
                const lowerName = modelName.toLowerCase();
                for (const [key] of supportedModelMap) {
                    if (key.toLowerCase() === lowerName) {
                        return true;
                    }
                }

                // 不再使用模糊匹配，避免误判
                // 例如 "Pro/deepseek-ai/DeepSeek-V3.2" 不应匹配 "DeepSeek-V3"

                return false;
            } catch (error) {
                console.warn('[代金券助手] 检查模型支持状态时出错:', error.message);
                return false;
            }
        },

        /**
         * 为模型卡片添加代金券支持徽章
         * @param {HTMLElement} card - 模型卡片元素
         * @param {string} modelName - 模型名称（用于生成唯一 ID）
         */
        addVoucherBadge(card, modelName) {
            try {
                // 检查是否已添加徽章
                const badgeId = this.BADGE_ID_PREFIX + modelName.replace(/[^a-zA-Z0-9]/g, '-');
                if (card.querySelector(`#${badgeId}`)) {
                    return;
                }

                // 确保卡片有相对定位
                const cardStyle = window.getComputedStyle(card);
                if (cardStyle.position === 'static') {
                    card.style.position = 'relative';
                }

                // 创建徽章元素
                const badge = document.createElement('div');
                badge.id = badgeId;
                badge.className = 'voucher-support-badge';
                badge.textContent = '💰 代金券';
                badge.title = '此模型支持使用代金券抵扣';

                // 插入到卡片中
                card.appendChild(badge);
            } catch (error) {
                console.warn('[代金券助手] 添加徽章失败:', error.message);
            }
        },

        /**
         * 移除模型卡片上的代金券徽章
         * @param {HTMLElement} card - 模型卡片元素
         */
        removeVoucherBadge(card) {
            try {
                const badges = card.querySelectorAll('.voucher-support-badge');
                badges.forEach(badge => badge.remove());
            } catch (error) {
                console.warn('[代金券助手] 移除徽章失败:', error.message);
            }
        },

        /**
         * 仅移除所有徽章（不移除开关按钮）
         */
        removeBadges() {
            try {
                const badges = document.querySelectorAll('.voucher-support-badge');
                badges.forEach(badge => badge.remove());
            } catch (error) {
                console.warn('[代金券助手] 移除徽章失败:', error.message);
            }
        },

        /**
         * 清理所有徽章和开关按钮
         */
        cleanup() {
            try {
                // 移除所有徽章
                this.removeBadges();
                
                // 移除开关按钮
                const toggle = document.getElementById(this.TOGGLE_ID);
                if (toggle) {
                    toggle.remove();
                }
            } catch (error) {
                console.warn('[代金券助手] 清理徽章失败:', error.message);
            }
        },

        /**
         * 标记所有支持代金券的模型
         * @param {Map<string, number[]>} supportedModelMap - 支持的模型映射
         */
        markSupportedModels(supportedModelMap) {
            try {
                this.injectStyles();
                
                const cardsWithNames = this.getAllModelCardsWithNames();
                let markedCount = 0;

                for (const { card, name } of cardsWithNames) {
                    try {
                        if (this.isModelSupported(name, supportedModelMap)) {
                            this.addVoucherBadge(card, name);
                            markedCount++;
                        }
                    } catch (error) {
                        console.warn('[代金券助手] 标记模型时出错:', error.message);
                    }
                }

                console.log(`[代金券助手] 已标记 ${markedCount} 个支持代金券的模型`);
            } catch (error) {
                console.error('[代金券助手] 标记支持模型失败:', error.message);
            }
        },

        /**
         * 初始化模型标记（获取数据并标记）
         */
        async init() {
            console.log('[代金券助手] 开始初始化模型标记...');
            
            // 注入样式
            this.injectStyles();
            
            // 读取开关状态
            this.enabled = this.getEnabled();
            
            // 添加开关按钮
            this.createToggleButton();

            try {
                // 获取代金券包信息
                let packagesResult;
                try {
                    packagesResult = await APIFetcher.fetchPackages();
                } catch (apiError) {
                    console.error('[代金券助手] 获取代金券包信息 API 调用失败:', apiError.message);
                    return;
                }
                
                if (!packagesResult.success) {
                    console.error('[代金券助手] 获取代金券包信息失败:', packagesResult.error);
                    return;
                }

                // 构建支持的模型映射
                try {
                    this.supportedModelMap = APIFetcher.buildSupportedModelMap(packagesResult.packages);
                    console.log(`[代金券助手] 支持代金券的模型数量: ${this.supportedModelMap.size}`);
                } catch (buildError) {
                    console.error('[代金券助手] 构建模型映射失败:', buildError.message);
                    return;
                }

                // 如果开关开启，等待页面加载完成后标记模型
                if (this.enabled) {
                    await this.waitAndMarkModels();
                } else {
                    console.log('[代金券助手] 模型标记已关闭，跳过标记');
                }

            } catch (error) {
                console.error('[代金券助手] 模型标记初始化失败:', error.message);
            }
        },

        /**
         * 等待模型卡片加载并标记
         */
        async waitAndMarkModels() {
            // 等待模型网格出现
            const maxWaitTime = 10000;
            const startTime = Date.now();

            const checkAndMark = () => {
                try {
                    const cards = this.getModelCards();
                    if (cards.length > 0) {
                        this.markSupportedModels(this.supportedModelMap);
                        return true;
                    }
                    return false;
                } catch (error) {
                    console.warn('[代金券助手] 检查并标记模型时出错:', error.message);
                    return false;
                }
            };

            // 先尝试立即标记
            if (checkAndMark()) {
                return;
            }

            // 使用 MutationObserver 监听 DOM 变化
            return new Promise((resolve) => {
                let observer;
                try {
                    observer = new MutationObserver(() => {
                        try {
                            if (checkAndMark()) {
                                observer.disconnect();
                                resolve();
                            } else if (Date.now() - startTime > maxWaitTime) {
                                observer.disconnect();
                                console.warn('[代金券助手] 等待模型卡片超时');
                                resolve();
                            }
                        } catch (error) {
                            console.warn('[代金券助手] MutationObserver 回调错误:', error.message);
                        }
                    });

                    observer.observe(document.body, {
                        childList: true,
                        subtree: true,
                    });

                    // 超时保护
                    setTimeout(() => {
                        if (observer) {
                            observer.disconnect();
                        }
                        checkAndMark();
                        resolve();
                    }, maxWaitTime);
                } catch (error) {
                    console.error('[代金券助手] 设置 MutationObserver 失败:', error.message);
                    resolve();
                }
            });
        },
    };

    // ============================================
    // 数据缓存模块
    // ============================================
    const DataCache = {
        // 缓存存储
        cache: new Map(),

        // 默认缓存过期时间（毫秒）- 5 分钟
        DEFAULT_TTL: 5 * 60 * 1000,

        // 缓存键常量
        CACHE_KEYS: {
            WALLETS: 'wallets',
            PACKAGES: 'packages',
            SUPPORTED_MODELS: 'supportedModels',
        },

        /**
         * 设置缓存
         * @param {string} key - 缓存键
         * @param {*} value - 缓存值
         * @param {number} ttl - 过期时间（毫秒），默认使用 DEFAULT_TTL
         */
        set(key, value, ttl = this.DEFAULT_TTL) {
            const expiresAt = Date.now() + ttl;
            this.cache.set(key, {
                value,
                expiresAt,
                createdAt: Date.now(),
            });
            console.log(`[代金券助手] 缓存已设置: ${key}, 过期时间: ${ttl / 1000}秒`);
        },

        /**
         * 获取缓存
         * @param {string} key - 缓存键
         * @returns {*} 缓存值，如果不存在或已过期则返回 null
         */
        get(key) {
            const entry = this.cache.get(key);
            
            if (!entry) {
                return null;
            }

            // 检查是否过期
            if (Date.now() > entry.expiresAt) {
                console.log(`[代金券助手] 缓存已过期: ${key}`);
                this.cache.delete(key);
                return null;
            }

            console.log(`[代金券助手] 使用缓存: ${key}`);
            return entry.value;
        },

        /**
         * 检查缓存是否存在且有效
         * @param {string} key - 缓存键
         * @returns {boolean} 是否存在有效缓存
         */
        has(key) {
            const entry = this.cache.get(key);
            if (!entry) {
                return false;
            }
            if (Date.now() > entry.expiresAt) {
                this.cache.delete(key);
                return false;
            }
            return true;
        },

        /**
         * 删除缓存
         * @param {string} key - 缓存键
         */
        delete(key) {
            this.cache.delete(key);
            console.log(`[代金券助手] 缓存已删除: ${key}`);
        },

        /**
         * 清空所有缓存
         */
        clear() {
            this.cache.clear();
            console.log('[代金券助手] 所有缓存已清空');
        },

        /**
         * 获取缓存统计信息
         * @returns {Object} 缓存统计
         */
        getStats() {
            const stats = {
                totalEntries: this.cache.size,
                entries: [],
            };

            for (const [key, entry] of this.cache) {
                const remainingTTL = Math.max(0, entry.expiresAt - Date.now());
                stats.entries.push({
                    key,
                    remainingTTL: Math.round(remainingTTL / 1000) + '秒',
                    isExpired: remainingTTL <= 0,
                });
            }

            return stats;
        },
    };

    // ============================================
    // SPA 导航监听模块
    // ============================================
    const NavigationListener = {
        // 回调函数列表
        callbacks: [],
        
        // 上一次的 URL
        lastUrl: '',
        
        // 上一次的页面类型
        lastPageType: '',
        
        // 是否已初始化
        initialized: false,
        
        // 定时检查器 ID
        intervalId: null,

        /**
         * 注册 URL 变化回调
         * @param {Function} callback - 回调函数，参数为 (newUrl, oldUrl, newPageType, oldPageType)
         */
        onUrlChange(callback) {
            if (typeof callback === 'function') {
                this.callbacks.push(callback);
            }
        },

        /**
         * 移除 URL 变化回调
         * @param {Function} callback - 要移除的回调函数
         */
        offUrlChange(callback) {
            const index = this.callbacks.indexOf(callback);
            if (index > -1) {
                this.callbacks.splice(index, 1);
            }
        },

        /**
         * 触发所有回调
         * @param {string} newUrl - 新 URL
         * @param {string} oldUrl - 旧 URL
         */
        triggerCallbacks(newUrl, oldUrl) {
            const newPageType = URLRouter.getPageType(newUrl);
            const oldPageType = this.lastPageType;
            
            this.callbacks.forEach(cb => {
                try {
                    cb(newUrl, oldUrl, newPageType, oldPageType);
                } catch (e) {
                    console.error('[代金券助手] URL 变化回调执行错误:', e);
                }
            });
            
            this.lastPageType = newPageType;
        },

        /**
         * 检查 URL 是否变化
         * @returns {boolean} 是否发生变化
         */
        checkUrlChange() {
            const currentUrl = window.location.href;
            if (currentUrl !== this.lastUrl) {
                const oldUrl = this.lastUrl;
                this.lastUrl = currentUrl;
                this.triggerCallbacks(currentUrl, oldUrl);
                return true;
            }
            return false;
        },

        /**
         * 初始化导航监听
         */
        init() {
            // 防止重复初始化
            if (this.initialized) {
                console.log('[代金券助手] 导航监听已初始化，跳过');
                return;
            }

            this.lastUrl = window.location.href;
            this.lastPageType = URLRouter.getPageType(this.lastUrl);

            // 监听 popstate 事件（浏览器前进/后退）
            window.addEventListener('popstate', () => {
                // 使用 setTimeout 确保 URL 已更新
                setTimeout(() => {
                    this.checkUrlChange();
                }, 0);
            });

            // 监听 hashchange 事件（hash 路由变化）
            window.addEventListener('hashchange', () => {
                this.checkUrlChange();
            });

            // 拦截 pushState 和 replaceState
            this.interceptHistoryMethods();

            // 定时检查（兜底方案，处理某些框架的特殊导航）
            // 使用较长的间隔以减少性能影响
            this.intervalId = setInterval(() => {
                this.checkUrlChange();
            }, 500);

            // 监听 click 事件，处理 SPA 链接点击
            document.addEventListener('click', (e) => {
                // 延迟检查，等待可能的导航完成
                setTimeout(() => {
                    this.checkUrlChange();
                }, 100);
            }, true);

            this.initialized = true;
            console.log('[代金券助手] 导航监听已初始化');
        },

        /**
         * 拦截 history.pushState 和 history.replaceState 方法
         */
        interceptHistoryMethods() {
            const self = this;

            // 保存原始方法
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            // 拦截 pushState
            history.pushState = function(state, title, url) {
                const result = originalPushState.apply(this, arguments);
                // 触发自定义事件
                window.dispatchEvent(new CustomEvent('pushstate', {
                    detail: { state, title, url }
                }));
                self.checkUrlChange();
                return result;
            };

            // 拦截 replaceState
            history.replaceState = function(state, title, url) {
                const result = originalReplaceState.apply(this, arguments);
                // 触发自定义事件
                window.dispatchEvent(new CustomEvent('replacestate', {
                    detail: { state, title, url }
                }));
                self.checkUrlChange();
                return result;
            };

            // 监听自定义事件（供其他模块使用）
            window.addEventListener('pushstate', () => {
                console.log('[代金券助手] 检测到 pushState 导航');
            });

            window.addEventListener('replacestate', () => {
                console.log('[代金券助手] 检测到 replaceState 导航');
            });
        },

        /**
         * 销毁导航监听
         */
        destroy() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            this.callbacks = [];
            this.initialized = false;
            console.log('[代金券助手] 导航监听已销毁');
        },

        /**
         * 获取当前状态
         * @returns {Object} 当前状态信息
         */
        getState() {
            return {
                initialized: this.initialized,
                lastUrl: this.lastUrl,
                lastPageType: this.lastPageType,
                callbackCount: this.callbacks.length,
            };
        },
    };

    // ============================================
    // 日志模块
    // ============================================
    const Logger = {
        // 日志级别
        LEVELS: {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
        },

        // 当前日志级别（可通过控制台修改）
        currentLevel: 1, // INFO

        // 日志前缀
        PREFIX: '[代金券助手]',

        /**
         * 格式化日志消息
         * @param {string} level - 日志级别名称
         * @param {string} module - 模块名称
         * @param {string} message - 日志消息
         * @returns {string} 格式化后的消息
         */
        format(level, module, message) {
            const timestamp = new Date().toLocaleTimeString();
            return `${this.PREFIX} [${timestamp}] [${level}] [${module}] ${message}`;
        },

        /**
         * 调试日志
         * @param {string} module - 模块名称
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         */
        debug(module, message, data) {
            if (this.currentLevel <= this.LEVELS.DEBUG) {
                if (data !== undefined) {
                    console.debug(this.format('DEBUG', module, message), data);
                } else {
                    console.debug(this.format('DEBUG', module, message));
                }
            }
        },

        /**
         * 信息日志
         * @param {string} module - 模块名称
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         */
        info(module, message, data) {
            if (this.currentLevel <= this.LEVELS.INFO) {
                if (data !== undefined) {
                    console.log(this.format('INFO', module, message), data);
                } else {
                    console.log(this.format('INFO', module, message));
                }
            }
        },

        /**
         * 警告日志
         * @param {string} module - 模块名称
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         */
        warn(module, message, data) {
            if (this.currentLevel <= this.LEVELS.WARN) {
                if (data !== undefined) {
                    console.warn(this.format('WARN', module, message), data);
                } else {
                    console.warn(this.format('WARN', module, message));
                }
            }
        },

        /**
         * 错误日志
         * @param {string} module - 模块名称
         * @param {string} message - 日志消息
         * @param {*} error - 错误对象或附加数据
         */
        error(module, message, error) {
            if (this.currentLevel <= this.LEVELS.ERROR) {
                if (error !== undefined) {
                    console.error(this.format('ERROR', module, message), error);
                } else {
                    console.error(this.format('ERROR', module, message));
                }
            }
        },

        /**
         * 设置日志级别
         * @param {number} level - 日志级别
         */
        setLevel(level) {
            if (level >= 0 && level <= 3) {
                this.currentLevel = level;
                console.log(`${this.PREFIX} 日志级别已设置为: ${Object.keys(this.LEVELS)[level]}`);
            }
        },
    };

    // ============================================
    // 应用控制器 - 整合所有模块
    // ============================================
    const AppController = {
        // 应用状态
        state: {
            initialized: false,
            currentPageType: PAGE_TYPE.UNKNOWN,
            lastError: null,
            moduleStatus: {
                urlRouter: false,
                navigationListener: false,
                dataCache: false,
                apiFetcher: false,
                voucherCalculator: false,
                voucherPanelUI: false,
                domInjector: false,
                modelMarker: false,
            },
        },

        /**
         * 初始化所有模块
         * @returns {Promise<boolean>} 是否初始化成功
         */
        async initialize() {
            Logger.info('AppController', '开始初始化应用...');

            try {
                // 1. 验证运行环境
                if (!this.validateEnvironment()) {
                    Logger.error('AppController', '运行环境验证失败');
                    return false;
                }

                // 2. 初始化 URL 路由模块
                this.state.moduleStatus.urlRouter = true;
                Logger.debug('AppController', 'URL 路由模块就绪');

                // 3. 初始化数据缓存模块
                this.state.moduleStatus.dataCache = true;
                Logger.debug('AppController', '数据缓存模块就绪');

                // 4. 初始化 API 获取模块
                this.state.moduleStatus.apiFetcher = true;
                Logger.debug('AppController', 'API 获取模块就绪');

                // 5. 初始化代金券计算模块
                this.state.moduleStatus.voucherCalculator = true;
                Logger.debug('AppController', '代金券计算模块就绪');

                // 6. 初始化 UI 模块
                this.state.moduleStatus.voucherPanelUI = true;
                this.state.moduleStatus.domInjector = true;
                this.state.moduleStatus.modelMarker = true;
                Logger.debug('AppController', 'UI 模块就绪');

                // 7. 初始化导航监听模块
                NavigationListener.init();
                this.state.moduleStatus.navigationListener = true;
                Logger.debug('AppController', '导航监听模块就绪');

                // 8. 注册导航变化处理器
                this.registerNavigationHandler();

                // 9. 处理当前页面
                this.state.currentPageType = URLRouter.getCurrentPageType();
                Logger.info('AppController', `当前页面类型: ${this.state.currentPageType}`);

                // 10. 执行初始页面处理
                await this.handlePageChange(this.state.currentPageType);

                this.state.initialized = true;
                Logger.info('AppController', '应用初始化完成', this.getStatus());

                return true;
            } catch (error) {
                this.state.lastError = error;
                Logger.error('AppController', '应用初始化失败', error);
                return false;
            }
        },

        /**
         * 验证运行环境
         * @returns {boolean} 环境是否有效
         */
        validateEnvironment() {
            // 检查是否在正确的域名下运行
            if (!URLRouter.isSiliconFlowDomain(window.location.href)) {
                Logger.warn('AppController', '当前不在硅基流动域名下，脚本将不执行');
                return false;
            }

            // 检查必要的 API 是否可用
            if (typeof GM_xmlhttpRequest === 'undefined') {
                Logger.warn('AppController', 'GM_xmlhttpRequest 不可用，将使用 fetch 降级');
            }

            return true;
        },

        /**
         * 注册导航变化处理器
         */
        registerNavigationHandler() {
            NavigationListener.onUrlChange(async (newUrl, oldUrl, newPageType, oldPageType) => {
                Logger.info('AppController', '检测到页面切换', {
                    from: oldPageType,
                    to: newPageType,
                    url: newUrl,
                });

                // 只有当页面类型发生变化时才重新处理
                // 或者是首次加载（oldUrl 为空）
                if (newPageType !== oldPageType || !oldUrl) {
                    this.state.currentPageType = newPageType;
                    await this.handlePageChange(newPageType);
                }
            });
        },

        /**
         * 处理页面切换
         * @param {string} pageType - 页面类型
         */
        async handlePageChange(pageType) {
            Logger.info('AppController', `处理页面: ${pageType}`);

            try {
                // 先清理之前的 UI
                this.cleanup();

                switch (pageType) {
                    case PAGE_TYPE.EXPENSE_BILL:
                        Logger.info('AppController', '进入费用账单页面，注入代金券面板');
                        await this.handleExpenseBillPage();
                        break;
                    case PAGE_TYPE.MODELS:
                        Logger.info('AppController', '进入模型列表页面，标记支持代金券的模型');
                        await this.handleModelsPage();
                        break;
                    default:
                        Logger.debug('AppController', '未知页面类型，跳过处理');
                }
            } catch (error) {
                this.state.lastError = error;
                Logger.error('AppController', `处理页面 ${pageType} 时发生错误`, error);
            }
        },

        /**
         * 处理费用账单页面
         */
        async handleExpenseBillPage() {
            try {
                await DOMInjector.injectVoucherPanel();
                Logger.info('AppController', '费用账单页面处理完成');
            } catch (error) {
                Logger.error('AppController', '费用账单页面处理失败', error);
                throw error;
            }
        },

        /**
         * 处理模型列表页面
         */
        async handleModelsPage() {
            try {
                await ModelMarker.init();
                Logger.info('AppController', '模型列表页面处理完成');
            } catch (error) {
                Logger.error('AppController', '模型列表页面处理失败', error);
                throw error;
            }
        },

        /**
         * 清理所有 UI 组件
         */
        cleanup() {
            try {
                DOMInjector.cleanup();
                ModelMarker.cleanup();
                Logger.debug('AppController', 'UI 清理完成');
            } catch (error) {
                Logger.warn('AppController', 'UI 清理时发生错误', error);
            }
        },

        /**
         * 强制刷新数据
         */
        async forceRefresh() {
            Logger.info('AppController', '强制刷新数据...');
            try {
                DataCache.clear();
                await this.handlePageChange(this.state.currentPageType);
                Logger.info('AppController', '数据刷新完成');
            } catch (error) {
                Logger.error('AppController', '数据刷新失败', error);
                throw error;
            }
        },

        /**
         * 获取应用状态
         * @returns {Object} 应用状态信息
         */
        getStatus() {
            return {
                initialized: this.state.initialized,
                currentPageType: this.state.currentPageType,
                lastError: this.state.lastError ? this.state.lastError.message : null,
                moduleStatus: { ...this.state.moduleStatus },
                cacheStats: DataCache.getStats(),
                navigationState: NavigationListener.getState(),
            };
        },

        /**
         * 销毁应用
         */
        destroy() {
            Logger.info('AppController', '销毁应用...');
            try {
                this.cleanup();
                NavigationListener.destroy();
                DataCache.clear();
                this.state.initialized = false;
                Logger.info('AppController', '应用已销毁');
            } catch (error) {
                Logger.error('AppController', '销毁应用时发生错误', error);
            }
        },
    };

    // ============================================
    // 主入口
    // ============================================
    async function main() {
        Logger.info('Main', '硅基流动代金券助手脚本已加载');
        Logger.info('Main', `版本: 1.0.0`);
        Logger.info('Main', `当前 URL: ${window.location.href}`);

        try {
            const success = await AppController.initialize();
            if (success) {
                Logger.info('Main', '脚本启动成功');
                // 将控制器暴露到全局，便于调试
                if (typeof unsafeWindow !== 'undefined') {
                    unsafeWindow.__VoucherHelper = {
                        controller: AppController,
                        logger: Logger,
                        refresh: () => AppController.forceRefresh(),
                        status: () => AppController.getStatus(),
                        setLogLevel: (level) => Logger.setLevel(level),
                    };
                    Logger.info('Main', '调试接口已暴露到 window.__VoucherHelper');
                }
            } else {
                Logger.error('Main', '脚本启动失败');
            }
        } catch (error) {
            Logger.error('Main', '脚本启动时发生未捕获的错误', error);
        }
    }

    // 启动脚本
    main();
})();
