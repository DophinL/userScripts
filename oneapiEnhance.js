// ==UserScript==
// @name         Oneapi Model生成ts类型
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Oneapi Model生成ts类型
// @author       孤独的二向箔
// @match        https://oneapi.alibaba-inc.com/*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        none
// @updateURL    http://gitlab.alibaba-inc.com/rhino-hub/userScripts/raw/master/oneapiEnhance.js
// @downloadURL  http://gitlab.alibaba-inc.com/rhino-hub/userScripts/raw/master/oneapiEnhance.js
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

  function getTypeName(refId) {
    const arr = refId.split('.');

    return arr[arr.length - 1];
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

    generateTemplate(showComment = true, showKey = true) {
      return `${makeComment(this.comment, showComment)}${this.key && showKey ? `${this.key}?: ` : ''}{
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

  class RefTemplate {
    constructor(params) {
      this.name = params.name;
      this.comment = params.comment;
      this.key = params.key;
      this.field = null;
      this.id = params.id;
    }

    // 必然是object field
    addSelfField(objectField) {
      this.field = objectField;
    }

    generateTemplate(showComment = true) {
      return `${makeComment(this.comment, showComment)}${this.key ? `${this.key}?: ` : ''}${this.name}`;
    }

    exportTemplate(showComment = true) {
      return `${makeComment(this.comment, showComment)}export interface ${this.name} ${this.field.generateTemplate(false, false)}`;
    }

    clone(key) {
      return new RefTemplate({
        name: this.name,
        comment: this.comment,
        field: this.field,
        id: this.id,
        key: key || this.key
      })
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

  class ModelTsGenerator {
    constructor(params) {
      this.schema = params.schema;
      this.tempRefTemplates = [];
    }

    getExistRefTemplateByRefKey(refKey) {
      return this.tempRefTemplates.find(t => t.id === refKey);
    }

    getObjectSchemaByRefKey(allSchema, refKey) {
      const address = getAddress(refKey);
      let targetSchema;
      allSchema.some((controller) => {
        targetSchema = getValueByFields(controller, address);

        return !!targetSchema;
      });

      if (!targetSchema) throw new Error('schema不存在');

      return targetSchema;
    }

    genObjectTemplateByRefKey(schema, refKey, key = '') {
      const targetSchema = getObjectSchemaByRefKey(schema, refKey);

      const objectTemplate = this.genObjectTemplate(targetSchema, key, schema, false);

      return objectTemplate;
    }

    genObjectTemplateBySchema(selfSchema, allSchema, key = '') {
      const objectTemplate = this.genObjectTemplate(selfSchema, key, allSchema, false);

      return objectTemplate;
    }

    genArrayTemplate(schema, key, allSchema) {
      const arrayTemplate = new ArrayTemplate({
        key,
        comment: schema.description,
      });

      // 这种必然是object的情况
      if (schema.items.$ref) {
        const existRefTemplate = this.getExistRefTemplateByRefKey(schema.items.$ref);

        if (existRefTemplate) {
          arrayTemplate.addField(existRefTemplate);
        } else {
          const objectSchema = this.getObjectSchemaByRefKey(allSchema, schema.items.$ref);
          const refTemplate = new RefTemplate({
            id: schema.items.$ref,
            name: getTypeName(schema.items.$ref),
            comment: objectSchema.description
          });
          this.tempRefTemplates.push(refTemplate);

          const objectTemplate = this.genObjectTemplateBySchema(objectSchema, allSchema);
          refTemplate.addSelfField(objectTemplate);
          arrayTemplate.addField(refTemplate);
        }
      } else if (schema.items.type) {
        // 到这里一定是普通类型
        const normalFieldTemplate = new NormalFieldTemplate({
          type: schema.items.type,
        });
        arrayTemplate.addField(normalFieldTemplate);
      }

      return arrayTemplate;
    }

    // 可能生成refTemplate
    genObjectTemplate(schema, key, allSchema, showComment = true) {
      const objectTemplate = new ObjectTemplate({
        comment: showComment ? schema.description : '',
        key,
      });

      if (schema.$ref) {
        const existRefTemplate = this.getExistRefTemplateByRefKey(schema.$ref);

        if (existRefTemplate) {
          // 如果沿用老key，可能会出现不同字段相同引用，但最终却产生了重复key的情况。
          return existRefTemplate.clone(key);
        } else {
          const objectSchema = this.getObjectSchemaByRefKey(allSchema, schema.$ref);
          const refTemplate = new RefTemplate({
            id: schema.$ref,
            name: getTypeName(schema.$ref),
            comment: objectSchema.description,
            key
          });
          this.tempRefTemplates.push(refTemplate);

          const objTemplate = this.genObjectTemplateBySchema(objectSchema, allSchema, key);

          refTemplate.addSelfField(objTemplate);

          return refTemplate;
        }
      } if (schema.properties) {
        Object.entries(schema.properties).forEach(([subKey, value]) => {
          if (value.type === 'object') {
            const nextLevelObjectTemplate = this.genObjectTemplate(value, subKey, allSchema);
            objectTemplate.addField(nextLevelObjectTemplate);
          } else if (value.type === 'array') {
            const nextLevelArrayTemplate = this.genArrayTemplate(value, subKey, allSchema);
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

    generate(refKey) {
      this.tempRefTemplates = [];

      const objectSchema = this.getObjectSchemaByRefKey(this.schema, refKey);
      const refTemplate = new RefTemplate({
        id: refKey,
        name: getTypeName(refKey),
        comment: objectSchema.description
      });

      this.tempRefTemplates.push(refTemplate);

      const objectTemplate = this.genObjectTemplateBySchema(objectSchema, this.schema);

      refTemplate.addSelfField(objectTemplate);

      // 需要先去重，可能有重复引用。
      const tsTypesStr = this.tempRefTemplates.map(t => {
        return t.exportTemplate();
      }).join('\n\n');

      this.tempRefTemplates = [];
      return tsTypesStr;
    }
  }

  let jsonSchema;

  function onMutation(mutationList) {
    mutationList.forEach((mutation) => {
      if (mutation.type === 'childList' && !!mutation.addedNodes.length > 0) {
        const curPageTitle = document.querySelector('.next-card-head-main .next-card-title')?.textContent || '';
        // 如果不是模型基本信息页面，则不作任何处理
        if (curPageTitle.trim() !== '模型基本信息') return;

        const target = Array.from(document.querySelectorAll('.next-form-item-label')).find((item) => item.textContent === '标识');

        if (!target) return;

        const params = getSearchParams();

        const paramsStr = Object.entries(params).map(([key, val]) => `${key}=${encodeURIComponent(val)}`).join('&');

        fetch(`/api/oneapi/query/withManual?${paramsStr}`).then((res) => res.json()).then((res) => {
          jsonSchema = res.content.map((str) => JSON.parse(str));
        });

        const button = $('<button id="genType">生成类型</button>').on('click', async () => {
          const id = $(target).siblings().get(0).textContent.trim();
          let tsTypes;
          try {
            const generator = new ModelTsGenerator({ schema: jsonSchema });
            tsTypes = generator.generate(`#/components/models/${id}`)
            // tsTypes = genModelTypeById(jsonSchema, id);
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
