export function getTriCount( geometry ) {

	const { index } = geometry;
	const posAttr = geometry.attributes.position;
	// 如果有索引，应该用索引/3来计算三角形个数。（因为有索引的话，会共用顶点）
	return index ? index.count / 3 : posAttr.count / 3;

}
