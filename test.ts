/**
 * OrderServiceMaterialAO
 */
export interface OrderServiceMaterialAO {
  /**
* 一个订单下的物料数据集合
*/
  children?: OrderServiceMaterialDetailAO[]

  /**
  * 物料名称
  */
  materialName?: string
  /**
  * 表单的值
  */
  materialValue?: {

  }
  /**
  * 销售订单
  */
  bizIdSaleOrder?: string
  /**
  * 物料ID
  */
  bizIdMaterialSpu?: string
  /**
  * 服务物料业务ID
  */
  bizIdServiceMaterial?: string
  /**
  * 是否要更新相同组相同服务的其他订单
  */
  updateOtherSaleOrder?: boolean
  /**
  * 订单配置数据业务ID
  */
  bizIdOrderMaterialConfig?: string
}

/**
* OrderServiceMaterialDetailAO
*/
export interface OrderServiceMaterialDetailAO {
  /**
* 孩子节点的数据值
*/
  children?: OrderServiceMaterialDetailAO[]

  /**
  * 物料名称
  */
  materialName?: string
  /**
  * 表单的值
  */
  materialValue?: {

  }
  /**
  * 物料ID
  */
  bizIdMaterialSpu?: string
  /**
  * 服务物料业务ID
  */
  bizIdServiceMaterial?: string
  /**
  * 订单配置数据业务ID
  */
  bizIdOrderMaterialConfig?: string
}