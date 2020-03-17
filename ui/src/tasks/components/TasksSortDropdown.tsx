// Libraries
import React, {FC} from 'react'

// Components
import {Dropdown} from '@influxdata/clockface'

// Types
import {Sort} from '@influxdata/clockface'
import {SortKey} from 'src/tasks/containers/TasksPage'
import {SortTypes} from 'src/shared/utils/sort'

interface ComponentProps {
  sortDirection: Sort
  sortKey: SortKey
  sortType: SortTypes
  onSelect: (sortKey: SortKey, sortDirection: Sort, sortType: SortTypes) => void
}

interface SortDropdownItem {
  label: string
  sortKey: SortKey
  sortType: SortTypes
  sortDirection: Sort
}

const TasksSortDropdown: FC<ComponentProps> = ({
  sortDirection,
  sortKey,
  sortType,
  onSelect,
}) => {
  const sortDropdownItems: SortDropdownItem[] = [
    {
      label: 'Name (A → Z)',
      sortKey: 'name',
      sortType: SortTypes.String,
      sortDirection: Sort.Ascending,
    },
    {
      label: 'Name (Z → A)',
      sortKey: 'name',
      sortType: SortTypes.String,
      sortDirection: Sort.Descending,
    },
    {
      label: 'Active',
      sortKey: 'status',
      sortType: SortTypes.String,
      sortDirection: Sort.Ascending,
    },
    {
      label: 'Inactive',
      sortKey: 'status',
      sortType: SortTypes.String,
      sortDirection: Sort.Descending,
    },
    {
      label: 'Completed (Oldest)',
      sortKey: 'latestCompleted',
      sortType: SortTypes.Date,
      sortDirection: Sort.Ascending,
    },
    {
      label: 'Completed (Newest)',
      sortKey: 'latestCompleted',
      sortType: SortTypes.Date,
      sortDirection: Sort.Descending,
    },
    {
      label: 'Schedule',
      sortKey: 'every',
      sortType: SortTypes.String,
      sortDirection: Sort.Ascending,
    },
  ]

  const {label} = sortDropdownItems.find(
    item =>
      item.sortKey === sortKey &&
      item.sortDirection === sortDirection &&
      item.sortType === sortType
  )

  const handleItemClick = (item: SortDropdownItem): void => {
    const {sortKey, sortDirection, sortType} = item
    onSelect(sortKey, sortDirection, sortType)
  }

  const button = (active, onClick) => (
    <Dropdown.Button onClick={onClick} active={active}>
      {`Sort by ${label}`}
    </Dropdown.Button>
  )

  const menu = onCollapse => (
    <Dropdown.Menu onCollapse={onCollapse}>
      {sortDropdownItems.map(item => (
        <Dropdown.Item
          key={`${item.sortKey}${item.sortDirection}`}
          value={item}
          onClick={handleItemClick}
          testID={`task-sort--${item.sortKey}-${item.sortDirection}`}
          selected={
            item.sortKey === sortKey &&
            item.sortType === sortType &&
            item.sortDirection === sortDirection
          }
        >
          {item.label}
        </Dropdown.Item>
      ))}
    </Dropdown.Menu>
  )

  return (
    <Dropdown
      button={button}
      menu={menu}
      style={{flexBasis: '210px', width: '210px'}}
    />
  )
}

export default TasksSortDropdown
