// ==UserScript==
// @name         Oneapi Model生成ts类型
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Oneapi Model生成ts类型
// @author       孤独的二向箔
// @match        https://oneapi.alibaba-inc.com/*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        none
// @updateURL    https://raw.githubusercontent.com/DophinL/userScripts/master/oneapiEnhance.js
// @downloadURL  https://raw.githubusercontent.com/DophinL/userScripts/master/oneapiEnhance.js
// @require      https://cdn.bootcss.com/jquery/3.6.0/jquery.min.js
// ==/UserScript==

(function () {
  const rawType2TsTypeMap = {
    any: 'any',
    boolean: 'boolean',
    literal: 'string',
    number: 'number',
    int64: 'number',
    int32: 'number',
    null: 'null',
    string: 'string',
    timestamp: 'string',
    unknown: 'unknown',
  };

  function makeComment(comment, showComment = true) {
    return comment && showComment ? `/**\n * ${comment}\n */\n` : '';
  }

  function getSearchParams() {
    return Object.fromEntries(new URLSearchParams(location.search));
  }

  class NormalFieldTemplate {
    constructor(params) {
      this.type = params.type;
      this.key = params.key;
      this.comment = params.comment;
    }

    static getTsType(type) {
      const lowerType = type.toLowerCase();

      return rawType2TsTypeMap[lowerType] || `not-found-type-${type}`;
    }

    generateTemplate() {
      return `${makeComment(this.comment)}${this.key ? `${this.key}?: ` : ''}${this.constructor.getTsType(this.type)}`;
    }
  }

  class ObjectTemplate {
    constructor(params) {
      this.key = params.key;
      this.comment = params.comment;
      this.fields = [];
    }

    addField(...fields) {
      this.fields.push(...fields);
    }

    generateTemplate(showComment = true) {
      return `${makeComment(this.comment, showComment)}${this.key ? `${this.key}?: ` : ''}{
      ${this.fields.map((field) => field.generateTemplate()).join('\n')}
  }`;
    }
  }

  class ArrayTemplate {
    constructor(params) {
      this.key = params.key;
      this.comment = params.comment;
      this.field = null;
    }

    addField(field) {
      this.field = field;
    }

    generateTemplate() {
      return `${makeComment(this.comment)}${this.key ? `${this.key}?: ` : ''}${this.field.generateTemplate(false)}[]
  `;
    }
  }

  function getAddress(addressStr) {
    const arr = addressStr.split('/');
    return arr.slice(1);
  }

  function getValueByFields(object, fields) {
    let target = object;
    fields.forEach(((k) => {
      target = target[k];
    }));
    return target;
  }

  function genArrayTemplate(schema, key, allSchema) {
    const arrayTemplate = new ArrayTemplate({
      key,
      comment: schema.description,
    });

    // 这种必然是object的情况
    if (schema.items.$ref) {
      // eslint-disable-next-line
      const objectTemplate = generateRefTemplate(allSchema, schema.items.$ref);
      arrayTemplate.addField(objectTemplate);
    } else if (schema.items.type) {
      // 到这里一定是普通类型
      const normalFieldTemplate = new NormalFieldTemplate({
        type: schema.items.type,
      });
      arrayTemplate.addField(normalFieldTemplate);
    }

    return arrayTemplate;
  }

  function genObjectTemplate(schema, key, allSchema, showComment = true) {
    const objectTemplate = new ObjectTemplate({
      comment: showComment ? schema.description : '',
      key,
    });

    if (schema.$ref) {
      // const ref = getValueByFields(schema, targetSchema.$ref);
      // eslint-disable-next-line
      return generateRefTemplate(allSchema, schema.$ref, key);
    } if (schema.properties) {
      Object.entries(schema.properties).forEach(([subKey, value]) => {
        if (value.type === 'object') {
          const nextLevelObjectTemplate = genObjectTemplate(value, subKey, allSchema);
          objectTemplate.addField(nextLevelObjectTemplate);
        } else if (value.type === 'array') {
          const nextLevelArrayTemplate = genArrayTemplate(value, subKey, allSchema);
          objectTemplate.addField(nextLevelArrayTemplate);
        } else {
          // 普通字段
          const normalFieldTemplate = new NormalFieldTemplate({
            key: subKey,
            type: value.type,
            comment: value.description,
          });

          objectTemplate.addField(normalFieldTemplate);
        }
      });
    }

    return objectTemplate;
  }

  function generateRefTemplate(schema, refKey, key = '') {
    const address = getAddress(refKey);
    let targetSchema;
    schema.some((controller) => {
      targetSchema = getValueByFields(controller, address);

      return !!targetSchema;
    });

    if (!targetSchema) throw new Error('schema不存在');

    const objectTemplate = genObjectTemplate(targetSchema, key, schema, false);

    return objectTemplate;
  }

  function genTypeExport(t, typeName = 'NewType') {
    return `export type ${typeName} = ${t.generateTemplate()}`;
  }

  /**
* 用此方法可以获取oneapi模型的ts类型
* 比如 genTypeById(schema, 'com.alibaba.rhino.biz.ao.order.agent.CreateOrderAO')
* @param schema oneapi的全量schema，可以在oneapi应用右上角点击「查看schema」并复制
* @param id 模型标识
*/
  function genModelTypeById(schema, id) {
    const refTemplate = generateRefTemplate(schema, `#/components/models/${id}`);
    const arr = id.split('.');

    const typeName = arr[arr.length - 1];

    return genTypeExport(refTemplate, typeName);
  }

  let jsonSchema;

  function onMutation(mutationList) {
    mutationList.forEach((mutation) => {
      // 新增或删除节点
      if (mutation.type === 'childList' && !!mutation.addedNodes.length > 0) {
        const curPageTitle = document.querySelector('.next-card-head-main .next-card-title')?.textContent || '';
        // 如果不是模型基本信息页面，则不作任何处理
        if (curPageTitle.trim() !== '模型基本信息') return;

        const target = Array.from(document.querySelectorAll('.next-form-item-label')).find((item) => item.textContent === '标识');

        if (!target) return;

        const params = getSearchParams();

        const paramsStr = Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');

        // 希望每次进入到模型页面，能执行一次
        fetch(`/api/oneapi/query/withManual?${paramsStr}`).then((res) => res.json()).then((res) => {
          jsonSchema = res.content.map((str) => JSON.parse(str));
        });

        const button = $('<button id="genType">生成类型</button>').on('click', async () => {
          const id = $(target).siblings().get(0).textContent.trim();
          let tsTypes;
          try {
            tsTypes = genModelTypeById(jsonSchema, id);
          } catch (err) {
            console.error(err);
            alert('生成类型出错，请联系作者');
            return;
          }

          console.log(tsTypes);
          await window.navigator.clipboard.writeText(tsTypes);
          alert('已将类型复制到剪贴板上');
        });

        $(target).append(button);
      }
    });
  }

  const observer = new MutationObserver(onMutation);

  observer.observe(document.body, { childList: true, subtree: true });
}());
